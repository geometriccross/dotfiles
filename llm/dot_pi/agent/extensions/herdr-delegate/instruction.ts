/**
 * Instruction builder for herdr-delegate child-agent delivery.
 * Pure function — no side effects.
 */

/**
 * Build the startup instruction text for the child agent.
 * No task content is passed via argv; the instruction tells the child to
 * read the task file and follow the contract.
 */
export function buildInstruction(
  taskFilePath: string,
  reportFilePath: string,
): string {
  return (
    `Read ${taskFilePath}, complete the task contract exactly, ` +
    `and write the required report. Do not modify files outside the allowed edit scope.`
  );
}
