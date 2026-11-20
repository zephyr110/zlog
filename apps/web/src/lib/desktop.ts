/** 桌面构建标识：prepare-standalone 在构建期注入，Web 构建为 undefined。
 *  必须是静态成员表达式，Next 才会在打包时内联替换。 */
export function isDesktopBuild(): boolean {
  return process.env.NEXT_PUBLIC_DESKTOP === "1"
}
