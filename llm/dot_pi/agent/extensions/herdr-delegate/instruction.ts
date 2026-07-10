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

/**
 * Build the continuation instruction for a reused child agent session.
 *
 * Unlike buildInstruction, this MUST compel the child to re-read the
 * task file even if it was already read in the previous task run.
 * The instruction includes:
 *  - an explicit statement that the task contract has been UPDATED
 *  - a command to re-read the file NOW
 *  - language that the old task instructions are obsolete
 *  - an attempt/revision marker to avoid identical prompt deduplication
 *  - the report file path
 */
export function buildContinuationInstruction(
  taskFilePath: string,
  reportFilePath: string,
  attemptOrRevision: number,
): string {
  return (
    `CONTINUATION (attempt/revision ${attemptOrRevision}): The task contract ` +
    `at ${taskFilePath} has been UPDATED. ` +
    `Re-read ${taskFilePath} NOW — even if you read it before — because ` +
    `the old task instructions are obsolete. ` +
    `Complete the newly read contract exactly and write the required ` +
    `report to ${reportFilePath}. ` +
    `Do not modify files outside the allowed edit scope.`
  );
}
