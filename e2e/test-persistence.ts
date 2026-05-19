import { getFirebaseIdToken } from './shared/auth';

const API = 'http://localhost:5001/api/v1';

async function test() {
  const token = await getFirebaseIdToken();
  const headers: Record<string, string> = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 1. Create a new conversation
  console.log('1. Creating conversation...');
  const createRes = await fetch(`${API}/execute/conversations`, {
    method: 'POST', headers,
    body: JSON.stringify({ agent_slug: 'xerus-master', title: 'persistence-test' }),
  });
  const createData = await createRes.json();
  const convId = createData.data.id;
  console.log(`   Created: ${convId}`);

  // 2. Get SSE token
  console.log('2. Getting SSE token...');
  const sseTokenRes = await fetch(`${API}/execute/sse-token`, { method: 'POST', headers });
  const sseTokenData = await sseTokenRes.json();
  const sseToken = sseTokenData.data?.token || sseTokenData.token;
  console.log(`   SSE token obtained`);

  // 3. Connect SSE stream
  console.log('3. Connecting SSE stream...');
  const sseUrl = `${API}/execute/conversations/${convId}/stream?token=${sseToken}`;
  const sseController = new AbortController();
  fetch(sseUrl, { signal: sseController.signal }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  // 4. Send a message
  console.log('4. Sending message...');
  const msgRes = await fetch(`${API}/execute/conversations/${convId}/messages`, {
    method: 'POST', headers,
    body: JSON.stringify({ task: 'Say hello in exactly 3 words.' }),
  });
  const msgData = await msgRes.json();
  console.log(`   Send status: ${msgRes.status}`);

  if (msgRes.status !== 202) {
    console.error('   FAILED:', JSON.stringify(msgData));
    sseController.abort();
    process.exit(1);
  }

  // 5. Wait for execution to complete (up to 3 minutes for cold start)
  console.log('5. Waiting for execution (up to 180s)...');
  let messages: any[] = [];
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const detailRes = await fetch(`${API}/execute/conversations/${convId}`, { headers });
    const detailData = await detailRes.json();
    messages = detailData.data?.messages || [];
    const msgCount = detailData.data?.message_count || 0;
    if (i % 10 === 0) process.stdout.write(`[${messages.length}m/${msgCount}c]`);
    else process.stdout.write('.');
    if (messages.length >= 2) break;
  }

  sseController.abort();

  // 6. Report
  console.log(`\n6. Found ${messages.length} persisted messages:`);
  for (const msg of messages) {
    console.log(`   [${msg.role}] ${(msg.content || '').slice(0, 120)}`);
  }

  if (messages.length >= 2) {
    console.log('\nPASS - Messages persist after execution');
  } else {
    console.log('\nFAIL - Messages NOT persisted');
    process.exit(1);
  }
}

test().catch(e => { console.error('Error:', e.message); process.exit(1); });
