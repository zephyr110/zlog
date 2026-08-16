export {
  getAllPosts,
  getPublishedPosts,
  getPublishedCount,
  getPostBySlug,
  savePost,
  deletePost,
  movePost,
  setPostPinned,
  getHomepageLatestPosts,
  getAllTags,
  getPostsByCategory,
  getPostsByTag,
} from "./content"
export { getUserByUsername, setUserPassword, setUserRecoveryHash } from "./users"
export {
  getLockoutState,
  recordLoginFailure,
  clearLoginFailures,
} from "./lockout"
export type { LockoutState } from "./lockout"
export {
  insertMedia,
  setMediaSha,
  listMedia,
  countMedia,
  getMediaData,
  deleteMedia,
} from "./media"
export type { MediaRecord, MediaMeta } from "./media"
export { getSiteSettings, upsertSiteSettings } from "./site-settings"
export type { SiteSettingsRecord, SiteSettingsUpdate } from "./site-settings"
export {
  getCommentsByPost,
  getReplyTarget,
  createComment,
  createReply,
  listAdminComments,
  countUnreadComments,
  markCommentRead,
  deleteComment,
  consumeRateLimit,
  ipRateScope,
  postRateScope,
  GLOBAL_RATE_SCOPE,
  RATE_LIMIT_IP_WINDOW_MS,
  RATE_LIMIT_IP_MAX,
  RATE_LIMIT_POST_WINDOW_MS,
  RATE_LIMIT_POST_MAX,
  RATE_LIMIT_GLOBAL_WINDOW_MS,
  RATE_LIMIT_GLOBAL_MAX,
} from "./comments"
export type {
  CommentRecord,
  AdminCommentRecord,
  AdminCommentPage,
} from "./comments"
// Re-export domain logic from core for backwards compatibility.
export { slugify, computeReadingStats } from "@zlog/core"
export type { Post, PostSummary } from "@zlog/core"
export type { UserRecord } from "./users"
export { runSync, scheduleSync, getSyncStatus, isSyncConfigured } from "./sync"
