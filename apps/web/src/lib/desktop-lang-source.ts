/** 有 DESKTOP_LANG_FILE 就是桌面语言源；文件尚未落盘时仍允许 POST 创建。 */
export function isDesktopLangSource(langFilePath: string | null | undefined): boolean {
  return Boolean(langFilePath)
}
