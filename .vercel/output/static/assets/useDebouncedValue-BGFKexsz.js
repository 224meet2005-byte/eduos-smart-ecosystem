import{a as t}from"./vendor-ui-COnqnM1k.js";function e(e,o=300){const[r,u]=t.useState(e);return t.useEffect(()=>{const t=setTimeout(()=>u(e),o);return()=>clearTimeout(t)},[e,o]),r}export{e as u};
