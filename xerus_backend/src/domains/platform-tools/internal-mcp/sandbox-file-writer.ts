import { SANDBOX_CONFIG } from '../../sandbox-infra/sandbox/sandbox.config';
import type { DaytonaProvider } from '../../sandbox-infra/sandbox/providers/daytona.provider';

export async function writeScaffoldFilesToSandbox(
    provider: DaytonaProvider,
    sandboxId: string,
    files: Array<{ path: string; content: string }>,
): Promise<void> {
    const basePath = SANDBOX_CONFIG.workspacePath;
    const HEREDOC = 'XERUS_SCAFFOLD_EOF_9c1a';
    for (const file of files) {
        if (file.content.includes(HEREDOC)) {
            throw new Error(`Scaffold file content for ${file.path} contains reserved heredoc delimiter`);
        }
        const fullPath = `${basePath}/${file.path}`;
        const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
        const writeCmd = `mkdir -p ${dirPath} && cat > ${fullPath} << '${HEREDOC}'\n${file.content}\n${HEREDOC}`;
        const { exitCode } = await provider.executeCommand(sandboxId, writeCmd);
        if (exitCode !== 0) {
            throw new Error(`Failed to write scaffold file ${file.path} to sandbox (exit ${exitCode})`);
        }
    }
}
