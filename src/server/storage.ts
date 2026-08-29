import { randomUUID } from 'node:crypto'

import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { createServerOnlyFn } from '@tanstack/react-start'

import { EXTENSIONS, type ImageFormat } from './image-validation'

/**
 * RustFS is reachable from this server and from Coolify, but never from a
 * user's browser, and the bucket has no public read access. Every object
 * therefore moves through the backend in both directions -- see the read proxy
 * route, which authorizes before it streams. Presigned URLs are not usable
 * here: they would address a host the browser cannot resolve.
 */
function createStorage() {
  const endpoint = process.env.S3_ENDPOINT
  const bucket = process.env.S3_BUCKET
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('S3_ENDPOINT, S3_BUCKET, and S3 credentials must be configured for uploads.')
  }
  return {
    bucket,
    client: new S3Client({
      endpoint,
      region: process.env.S3_REGION || 'us-east-1',
      // RustFS addresses buckets by path, not by DNS subdomain.
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    }),
  }
}

let storage: ReturnType<typeof createStorage> | undefined
function getStorage() {
  storage ??= createStorage()
  return storage
}

/** The object-key namespaces the application writes to. */
export const KEY_PREFIXES = ['shows', 'avatars', 'show-photos'] as const
export type KeyPrefix = (typeof KEY_PREFIXES)[number]

const KEY_PATTERN = new RegExp(
  `^(${KEY_PREFIXES.join('|')})/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(png|jpg|webp)$`,
)

/**
 * Keys are generated here and never taken from a client, so a user cannot
 * choose a path, overwrite someone else's object, or traverse out of a prefix.
 */
export function buildObjectKey(prefix: KeyPrefix, format: ImageFormat) {
  return `${prefix}/${randomUUID()}.${EXTENSIONS[format]}`
}

/** Guards the read proxy: anything not matching our own generated shape is refused. */
export function isValidObjectKey(key: string): boolean {
  return KEY_PATTERN.test(key)
}

export const putImage = createServerOnlyFn(
  async (key: string, body: Uint8Array, contentType: ImageFormat) => {
    if (!isValidObjectKey(key)) throw new Error('Refusing to write an unrecognized object key.')
    const { client, bucket } = getStorage()
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        // Nothing derives behavior from user input here, but be explicit that
        // stored objects are never to be interpreted as anything but images.
        ContentDisposition: 'inline',
      }),
    )
    return key
  },
)

export type StoredImage = {
  body: ReadableStream
  contentType: string
  contentLength?: number
  etag?: string
}

export const getImage = createServerOnlyFn(async (key: string): Promise<StoredImage | null> => {
  if (!isValidObjectKey(key)) return null
  const { client, bucket } = getStorage()
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    if (!result.Body) return null
    return {
      body: result.Body.transformToWebStream(),
      contentType: result.ContentType ?? 'application/octet-stream',
      contentLength: result.ContentLength,
      etag: result.ETag,
    }
  } catch (error) {
    if (error instanceof NoSuchKey || (error as { name?: string }).name === 'NoSuchKey') return null
    throw error
  }
})

export const deleteImage = createServerOnlyFn(async (key: string) => {
  if (!isValidObjectKey(key)) return
  const { client, bucket } = getStorage()
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
})
