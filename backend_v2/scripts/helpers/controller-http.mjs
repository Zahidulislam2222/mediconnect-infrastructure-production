// Exercise real controller HTTP parsing/responses. Authentication and provider boundaries remain test doubles.
import { afterEach } from 'node:test';
import { once } from 'node:events';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../../booking-service/package.json',import.meta.url));
const express=require('express');
const servers=[];
afterEach(async()=>Promise.all(servers.splice(0).map(server=>new Promise(resolve=>server.close(resolve)))));
export function controllerHttpHarness(){
 const app=express(),cases=new Map();let sequence=0;
 app.use(express.json());
 app.post('/:caseId',(req,res,next)=>{
  const fixture=cases.get(req.params.caseId);
  if(!fixture)return res.sendStatus(404);
  req.user=fixture.fields.user;
  req.params=fixture.fields.params??{};
  try{Promise.resolve(fixture.handler(req,res,next)).catch(next);}catch(error){next(error);}
 });
 app.use((error,req,res,next)=>res.status(500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1'),listening=once(server,'listening');servers.push(server);
 return async(handler,fields)=>{
  const id=String(++sequence);cases.set(id,{handler,fields});await listening;
  try{
   const response=await fetch(`http://127.0.0.1:${server.address().port}/${id}`,{
    method:'POST',headers:{'content-type':'application/json',...fields.headers},body:JSON.stringify(fields.body??{}),
   });
   const text=await response.text();let body;try{body=JSON.parse(text);}catch{body=text;}
   return {status:response.status,body};
  }finally{cases.delete(id);}
 };
}
