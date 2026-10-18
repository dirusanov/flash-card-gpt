const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: file,
}).outputText, file);
global.location = { protocol: 'chrome-extension:' };
const calls = [], replies = [];
const file = path.resolve(__dirname, '../../src/services/backgroundFetch.ts');
require.cache[file] = { id: file, filename: file, loaded: true, exports: {
  backgroundFetch: async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return { ok: true, text: async () => replies.shift() };
  },
}};
const { isAudibleWavDataUrl, normalizeWavDataUrl, audioFileExtension } = require('../../src/services/speechQuality.ts');
const { getOpenAiSpeechAudioDataUrl } = require('../../src/services/openaiApi.ts');
function wav(amplitude, streaming=false) {
  const data=Buffer.alloc(44+12000);
  data.write('RIFF');data.writeUInt32LE(streaming?0xffffffff:data.length-8,4);data.write('WAVEfmt ',8);
  data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);
  data.writeUInt32LE(24000,24);data.writeUInt32LE(48000,28);data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);
  data.write('data',36);data.writeUInt32LE(streaming?0xffffffff:data.length-44,40);
  for(let i=0;i<6000;i++)data.writeInt16LE(Math.round(amplitude*Math.sin(i/10)),44+i*2);
  return 'data:audio/wav;base64,'+data.toString('base64');
}
(async()=>{
  assert.equal(isAudibleWavDataUrl(wav(0)),false);
  assert.equal(isAudibleWavDataUrl(wav(40)),false);
  assert.equal(isAudibleWavDataUrl(wav(5000)),true);
  assert.equal(isAudibleWavDataUrl('data:audio/wav;base64,TVAz'),false);
  assert.equal(isAudibleWavDataUrl(wav(5000).slice(0,-4)),false);
  assert.equal(isAudibleWavDataUrl(normalizeWavDataUrl(wav(5000,true))),true);
  assert.equal(audioFileExtension(wav(5000)),'wav');
  assert.equal(audioFileExtension('data:audio/mp3;base64,TVAz'),'mp3');
  replies.push(wav(0),wav(5000,true));
  const result=await getOpenAiSpeechAudioDataUrl('test-key','sin hogar','es');
  assert.ok(isAudibleWavDataUrl(result));assert.equal(calls.length,2);
  assert.ok(calls.every(c=>c.input==='sin hogar' && c.instructions.includes('Spanish') && c.response_format==='wav'));
  replies.push(wav(0),wav(0),wav(0));
  await assert.rejects(()=>getOpenAiSpeechAudioDataUrl('test-key','猫','ja'),/silent or malformed/);
  assert.equal(calls.length,5);assert.equal(calls[4].model,'tts-1');assert.ok(calls[2].instructions.includes('Japanese'));
  console.log('Speech quality tests passed: streaming WAV, truncation, silence, retry and language.');
})().catch(e=>{console.error(e);process.exitCode=1});
