import{E as e}from"./server-DrDvUFfn.mjs";function t(t,r=300){const[o,s]=e.useState(t);return e.useEffect(()=>{const e=setTimeout(()=>s(t),r);return()=>clearTimeout(e)},[t,r]),o}export{t as e};
