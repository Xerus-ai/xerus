import { Daytona } from '@daytonaio/sdk';

const client = new Daytona({
  apiKey: 'dtn_d71e986f043bcea7664240c198e8ec616d367b1300319dc610e5d3c9dab468f7',
  apiUrl: 'http://localhost:3000/api',
});

async function main() {
  const sb = await client.get('278d93ca-314d-44f6-be6d-20e687aeab5c');

  // Check latest chat_executions
  const latest = await sb.process.executeCommand(
    `sqlite3 -json /home/daytona/data/workspace.db "SELECT id, conversation_id, substr(user_message,1,40) as msg, CASE WHEN agent_response IS NOT NULL THEN length(agent_response) ELSE 0 END as resp_len, created_at FROM chat_executions ORDER BY id DESC LIMIT 5"`
  );
  console.log('LATEST:', latest.result);

  // Check /tmp/chat-exec for new files
  const tmp = await sb.process.executeCommand(`ls -lt /tmp/chat-exec/ 2>&1 | head -10`);
  console.log('TMP:', tmp.result);

  // Try running the latest python script if exists
  const pyFiles = await sb.process.executeCommand(`ls -t /tmp/chat-exec/*.py 2>/dev/null | head -1`);
  const latestPy = pyFiles.result?.trim();
  if (latestPy && !latestPy.includes('No such file')) {
    console.log('Latest py:', latestPy);
    const pyRun = await sb.process.executeCommand(`python3 ${latestPy} 2>&1`);
    console.log('PY_RUN exit:', pyRun.exitCode, 'result:', pyRun.result || '(empty)');
  }

  // Check conversation for the test
  const conv = await sb.process.executeCommand(
    `sqlite3 -json /home/daytona/data/workspace.db "SELECT id, message_count, title FROM conversations WHERE id='86c69f25-169f-4465-9c0c-94e74b7cb06d'"`
  );
  console.log('CONV:', conv.result);
}

main().then(() => process.exit(0)).catch(e => { console.error('ERR:', e.message); process.exit(1); });
