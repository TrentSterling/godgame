// A fresh tracked fingertip must approach from in front of the same button.
// Acquisition inside a button, held contact, and tracking loss never click.
export function makeUIPokeState(){return{button:null,previous:null,armed:false};}
export function resetUIPoke(state){state.button=null;state.previous=null;state.armed=false;}
export function updateUIPoke(state,hit){
 if(!hit||!Number.isFinite(hit.depth)){resetUIPoke(state);return null;}
 const press=.025,release=.055;
 if(state.button!==hit.id){state.button=hit.id;state.previous=hit.depth;state.armed=hit.depth>=release;return null;}
 if(hit.depth>=release)state.armed=true;
 const pressed=state.armed&&state.previous>press&&hit.depth<=press&&hit.depth>=-.025;
 if(pressed||hit.depth<-.025)state.armed=false;
 state.previous=hit.depth;return pressed?hit.id:null;
}
