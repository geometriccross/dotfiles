export function isHerdrRuntime(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return env.HERDR_ENV === "1";
}
