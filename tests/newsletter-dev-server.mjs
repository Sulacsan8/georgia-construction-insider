// Isolated test server: upstream signup/auth are mocked and no email is sent.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GET, DELETE } from "../api/newsletter.js";
import { POST } from "../api/subscribe.js";
if (process.env.GCI_LOCAL_TEST !== "1") throw new Error("Local test server only");
let now=Date.parse("2026-11-15T16:30:00Z"),subscriptionStatus="active",signupCalls=0;
Date.now=()=>now;
process.env.BEEHIIV_API_KEY="local-test-only";process.env.SUPABASE_URL="https://gci-auth.test";process.env.SUPABASE_ANON_KEY="test";
globalThis.fetch=async(url,options)=>{
 if(String(url).endsWith('/auth/v1/user'))return Response.json(options.headers.Authorization==='Bearer local-reader-token'?{id:'local-reader'}:{},{status:options.headers.Authorization==='Bearer local-reader-token'?200:401});
 if(String(url).includes('api.beehiiv.com')){signupCalls++;return Response.json({data:{status:subscriptionStatus}});}
 throw new Error("Unexpected upstream request: "+url);
};
const root=path.resolve("public"),mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.xml':'application/xml'};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1:4322');let chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);
  let response;
  if(url.pathname==='/__test/scenario'){const value=JSON.parse(body||'{}');if(value.now)now=Date.parse(value.now);if(value.subscriptionStatus)subscriptionStatus=value.subscriptionStatus;response=Response.json({now,signupCalls});}
  else if(url.pathname==='/api/config')response=Response.json({supabaseUrl:'https://gci-auth.test',supabaseAnonKey:'test'});
  else if(url.pathname==='/api/newsletter'||url.pathname==='/api/subscribe'){
   const request=new Request(url,{method:req.method,headers:req.headers,...(body.length?{body}:{} )});
   response=await(url.pathname==='/api/subscribe'?POST(request):req.method==='DELETE'?DELETE(request):GET(request));
  }else{
   let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));if(!file.startsWith(root+path.sep)&&file!==root)throw new Error('outside root');
   if(url.pathname==='/')file=path.join(root,'index.html');else if(!path.extname(file))file+='.html';
   let data;try{data=await readFile(file);}catch{file=path.join(root,'index.html');data=await readFile(file);}
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);return;
  }
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){console.error(error);res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:error.message}));}
}).listen(4322,'127.0.0.1',()=>console.log('Isolated newsletter test server listening on 4322'));
