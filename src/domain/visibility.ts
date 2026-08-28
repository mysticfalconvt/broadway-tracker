export const visibilityOptions = ['private', 'friends', 'public'] as const
export type Visibility = (typeof visibilityOptions)[number]

export const libraryStatuses = ['want_to_see', 'seen'] as const

export const datePrecisionOptions = ['exact', 'month', 'year', 'approximate', 'unknown'] as const
export type DatePrecision = (typeof datePrecisionOptions)[number]
export type LibraryStatus = (typeof libraryStatuses)[number]
