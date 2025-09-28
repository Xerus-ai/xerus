require('dotenv').config();

console.log('Environment Variables Test:');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Present (length: ' + process.env.OPENAI_API_KEY.length + ')' : 'Missing');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'Present (length: ' + process.env.GEMINI_API_KEY.length + ')' : 'Missing');
console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? 'Present' : 'Missing');

// Test if they're being set correctly
if (process.env.OPENAI_API_KEY) {
    console.log('OpenAI key preview:', process.env.OPENAI_API_KEY.substring(0, 10) + '...');
}
if (process.env.GEMINI_API_KEY) {
    console.log('Gemini key preview:', process.env.GEMINI_API_KEY.substring(0, 10) + '...');
}