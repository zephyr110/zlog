/** 桌面构建标识：next.config 由 NEXT_DESKTOP 派生并构建期内联为 "1"/"0"。
 *  必须是静态成员表达式，Next 才会在打包时内联替换。 */
export function isDesktopBuild(): boolean {
  return process.env.NEXT_PUBLIC_DESKTOP === "1"
}
