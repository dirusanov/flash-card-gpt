const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');
require.extensions['.ts'] = require.extensions['.tsx'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  }, fileName: filename }).outputText, filename);
for (const extension of ['.png','.svg','.css']) require.extensions[extension]=(module, filename)=>{module.exports=filename};
const React = require('react');
const {create, act} = require('react-test-renderer');
const {Modes} = require('../../src/constants.ts');
const {prepareCardEdit} = require('../../src/services/cardEditing.ts');
const original = {id:'qa', mode:Modes.LanguageLearning, text:'curiosity', translation:'любопытство', examples:[['Curiosity helps.', 'Любопытство помогает.']], createdAt:new Date(), exportStatus:'not_exported', deckId:'deck', linguisticInfo:'noun'};
assert.equal(prepareCardEdit(original,{translation:'   '}), null);
assert.equal(prepareCardEdit(original,{text:'   '}), null);
assert.equal(prepareCardEdit(original,{linguisticInfo:'', deckId:null}).linguisticInfo, '');
assert.equal(prepareCardEdit(original,{deckId:null}).deckId, null);
const concurrent = {...original, exportStatus:'exported_to_anki', syncVersion:9, deckId:'new-deck', examplesAudio:['fresh-audio']};
const merged = prepareCardEdit(original,{...original,translation:'new'},concurrent);
assert.equal(merged.exportStatus,'exported_to_anki');
assert.equal(merged.syncVersion,9);
assert.equal(merged.deckId,'new-deck');
assert.deepEqual(merged.examplesAudio,['fresh-audio']);
const state = {deck:{decks:[],deckId:null}, settings:{useAnkiConnect:false, modelProvider:'openai', syncApiUrl:'https://qa.invalid', translateToLanguage:'ru'}, anki:{isAnkiAvailable:false}, auth:{}, vaultoDecks:{decks:[]}};
const errors=[]; let writes=[]; let cards=[original]; let tree; let pendingAudio;
const dispatch=()=>{};
const tab={get storedCards(){return cards}, updateStoredCard(card){writes.push(card); cards=cards.map(item=>item.id===card.id?card:item)}, setCurrentPage() {}};
const Modal=({children,footer,...props})=>React.createElement('qa-modal',props,children,footer);
const StudyCard=props=>React.createElement('qa-card',props);
const originalLoad=Module._load;
Module._load=function(name,parent,...rest){
 if(name==='react-redux') return {useSelector:fn=>fn(state),useDispatch:()=>dispatch};
 if(name.endsWith('/TabAwareProvider') || name==='./TabAwareProvider') return {useTabAware:()=>tab};
 if(name==='./useErrorHandler') return {__esModule:true,default:()=>({showError:e=>errors.push(e),renderErrorNotification:()=>null})};
 if(name.endsWith('/useAuthenticatedRequest')) return {useAuthenticatedRequest:()=>()=>{}};
 if(name==='./ui/Modal') return {__esModule:true,default:Modal};
 if(name==='./StoredCards/StudyCard') return {__esModule:true,default:StudyCard};
 if(name.endsWith('/quickStart')) return {createTrialAudio:()=>new Promise(resolve=>{pendingAudio=resolve})};
 return originalLoad.call(this,name,parent,...rest);
};
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.chrome={storage:{local:{get:(_k,cb)=>{cb?.({});return Promise.resolve({})}}}};
global.window={setTimeout,clearTimeout};
const StoredCards=require('../../src/components/StoredCards.tsx').default;
Module._load=originalLoad;
const text = node => (node.children||[]).map(x=>typeof x==='string'?x:typeof x==='object'?text(x):'').join('');
const button=label=>tree.root.findAllByType('button').find(n=>text(n).trim()===label);
const render=async()=>act(async()=>{tree=create(React.createElement(StoredCards,{onBackClick(){}}))});
const openEditor=async()=>{
 await act(async()=>tree.root.findAllByType('button').find(n=>n.props['aria-label']?.startsWith('curiosity')||text(n).includes('curiosity')&&text(n).includes(cards[0].translation)).props.onClick());
 await act(async()=>button('Edit card').props.onClick());
};
(async()=>{
 await render();
 for(const close of ['done','modal']){
  await openEditor();
  await act(async()=>tree.root.findByType('qa-card').props.onTranslationChange(`новый перевод ${close}`));
  const before=writes.length;
  await act(async()=>close==='done'?button('Done').props.onClick():tree.root.findByType('qa-modal').props.onClose());
  assert.equal(writes.length,before+1,'close must flush immediately before debounce fires');
  assert.equal(cards[0].translation,`новый перевод ${close}`);
  assert.equal(tree.root.findAllByType('qa-modal').length,0);
  await act(async()=>tree.update(React.createElement(StoredCards,{onBackClick(){}})));
 }
 await openEditor();
 await act(async()=>tree.root.findByType('qa-card').props.onTranslationChange(' '));
 await act(async()=>button('Done').props.onClick());
 assert.equal(tree.root.findAllByType('qa-modal').length,1,'invalid draft stays open');
 assert.ok(errors.length);
 await act(async()=>tree.root.findByType('qa-card').props.onTranslationChange('любопытство'));
 await act(async()=>button('Done').props.onClick());
 await act(async()=>tree.update(React.createElement(StoredCards,{onBackClick(){}})));
 // Lazy audio attaches to the latest card and survives a concurrent deck change.
 await act(async()=>tree.root.findAllByType('button').find(n=>text(n).includes('curiosity')&&text(n).includes('любопытство')).props.onClick());
 let request;
 act(()=>{request=tree.root.findByType('qa-card').props.onRequestExampleAudio(0)});
 cards=[{...cards[0],deckId:'moved-while-speaking'}];
 await act(async()=>tree.update(React.createElement(StoredCards,{onBackClick(){}})));
 await act(async()=>{pendingAudio('data:audio/wav;base64,QA');await request});
 assert.equal(cards[0].deckId,'moved-while-speaking');
 assert.equal(cards[0].examplesAudio[0],'data:audio/wav;base64,QA');
 // Never attach speech to an example changed while generation was running.
 act(()=>{request=tree.root.findByType('qa-card').props.onRequestExampleAudio(0)});
 cards=[{...cards[0],examples:[['A different sentence.',null]],examplesAudio:[null]}];
 await act(async()=>tree.update(React.createElement(StoredCards,{onBackClick(){}})));
 await act(async()=>{pendingAudio('data:audio/wav;base64,STALE');await request});
 assert.equal(cards[0].examplesAudio[0],null);
 await act(async()=>tree.unmount());
 console.log('PASS: actual StoredCards fast Done/modal close, invalid drafts, lazy audio and stale-result guards');
})().catch(e=>{console.error(e);process.exitCode=1});
