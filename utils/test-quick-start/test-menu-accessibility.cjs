const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},fileName:filename}).outputText,filename);
const React = require('react');
const {create, act} = require('react-test-renderer');
const dom = require('react-dom');
let portalTarget;
dom.createPortal=(children,target)=>{portalTarget=target;return children};
const handlers=new Set();
global.document={activeElement:null,body:{},addEventListener:(type,fn)=>{if(type==='keydown')handlers.add(fn)},removeEventListener:(_type,fn)=>handlers.delete(fn)};
global.window={innerHeight:800,innerWidth:1200,addEventListener(){},removeEventListener(){}};
global.Element=class {};
class Focusable extends Element {
 constructor(menu=false){super();this.menu=menu;this.offsetParent={};}
 focus(){
  if(this.menu && tree) assert.equal(tree.root.findByProps({role:'menu'}).props.style.visibility,'visible','focus must wait until the measured menu is visible');
  document.activeElement=this;
 }
 closest(selector){return selector==='[role="menu"]'&&this.menu?panel:null;}
 getClientRects(){return [{}];}
}
const trigger=new Focusable(), first=new Focusable(true), last=new Focusable(true), next=new Focusable();
const dialog={querySelector:()=>trigger,querySelectorAll:()=>[trigger,next,first,last]};
const anchor={getBoundingClientRect:()=>({top:50,bottom:80,left:20}),closest:()=>dialog,querySelector:()=>trigger,contains:()=>false};
const panel={offsetHeight:100,querySelector:()=>first,querySelectorAll:()=>[first,last],contains:()=>false};
const Menu=require('../../src/components/ui/Menu.tsx').default;
const Modal=require('../../src/components/ui/Modal.tsx').default;
let closed=0, selected=null, tree;
act(()=>{tree=create(React.createElement(Modal,{open:true,onClose:()=>closed++,title:'Decks'},React.createElement(Menu,{
 trigger:({toggle})=>React.createElement('button',{onClick:toggle},'Actions'),items:[{value:'rename',label:'Rename'},{value:'delete',label:'Delete'}],value:'rename',onSelect:value=>selected=value,label:'Deck actions',
})),{createNodeMock:element=>element.props.role==='dialog'?dialog:element.props.role==='menu'?panel:anchor})});
const open=()=>act(()=>tree.root.findAllByType('button').find(node=>node.children.includes('Actions')).props.onClick());
const key=(key,shiftKey=false)=>act(()=>{const event={key,shiftKey,target:document.activeElement,preventDefault(){},stopPropagation(){}}; for(const handler of [...handlers])handler(event)});
open();assert.equal(portalTarget,dialog,'menu must stay inside aria-modal boundary');assert.equal(document.activeElement,first);
key('ArrowDown');assert.equal(document.activeElement,last);
key('Home');assert.equal(document.activeElement,first);
key('End');assert.equal(document.activeElement,last);
key('Escape');assert.equal(closed,0,'Escape closes only menu, not its modal');assert.equal(document.activeElement,trigger);
assert.equal(tree.root.findAllByProps({role:'menu'}).length,0);
open();key('Tab');assert.equal(document.activeElement,next,'Tab continues through dialog after the trigger');
open();act(()=>tree.root.findAllByProps({role:'menuitemradio'})[0].props.onClick());assert.equal(selected,'rename');
act(()=>tree.unmount());assert.equal(handlers.size,0);
console.log('PASS: actual Menu/Modal portal scope, arrow keys, Escape, Tab, selection and listener cleanup');
