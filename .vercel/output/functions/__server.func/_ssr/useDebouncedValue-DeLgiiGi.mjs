import{B as t}from"./server-C5FtxiKt.mjs";function e(e,r=300){const[o,s]=t.useState(e);return t.useEffect(()=>{const t=setTimeout(()=>s(e),r);return()=>clearTimeout(t)},[e,r]),o}export{e};
