import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const intents=["looking for","need a","hiring a","seeking a","recommend a","want to hire","need help with","searching for someone to","open project for","freelance project for","request for proposal for","need an agency for","looking to outsource","who can build","anyone available for","budget for","urgent help needed with","project requirement","work opportunity for","developer required for","designer required for","consultant needed for","seeking bids for","looking for quotes on"];
const services=["{skill}","{skill} freelancer","{skill} developer","{skill} specialist","{skill} agency","{skill} expert","{skill} consultant","{skill} contractor","{skill} service provider","{skill} project","{skill} work","{skill} services","{skill} professional","{skill} team","{skill} partner","{skill} company"];
const platforms=["site:linkedin.com/posts","site:linkedin.com","site:facebook.com","site:fb.com","site:instagram.com","site:x.com","site:twitter.com","site:threads.net","public social post"];
const geos=["{area}","in {area}","near {area}","based in {area}","serving {area}","{area} businesses","{area} company","{area} project"];
const forms=['{platform} "{intent}" "{service}" "{geo}"','{platform} "{service}" "{intent}" "{geo}"','{platform} "{intent}" "{skill}" "{geo}"','{platform} "{service}" project budget "{geo}"','{platform} "{service}" hiring OR freelance "{geo}"'];
const capacity=intents.length*services.length*platforms.length*geos.length*forms.length;
function render(t:string,v:Record<string,string>){return t.replace(/\{(platform|intent|service|geo|skill)\}/g,(_,k:string)=>v[k]??"")}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer "))return reply({error:"Authentication required"},401);
 const url=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY");
 if(!url||!anon)return reply({error:"Backend auth configuration is incomplete"},503);
 const client=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.getUser();
 if(error||!data.user)return reply({error:"Invalid or expired session"},401);
 let body:Record<string,unknown>;try{body=await req.json()}catch{return reply({error:"Invalid JSON"},400)}
 const skill=typeof body.skill==="string"?body.skill.trim().slice(0,100):"";
 const country=typeof body.country==="string"?body.country.trim().slice(0,100):"";
 const city=typeof body.city==="string"?body.city.trim().slice(0,100):"";
 const maxResults=typeof body.maxResults==="number"?Math.floor(body.maxResults):20;
 if(skill.length<2||country.length<2)return reply({error:"Enter a skill and country."},400);
 if(maxResults<1||maxResults>100)return reply({error:"Result target must be between 1 and 100."},400);
 const area=city?city+", "+country:country;
 const selected=[[0,0,0,1,0],[1,1,2,1,1],[2,2,4,0,2],[3,3,5,5,3],[4,4,6,1,4],[5,5,3,2,0],[6,6,7,3,1],[7,7,8,5,2]];
 const count=Math.min(8,Math.max(5,Math.ceil(maxResults/12)));
 const queries=selected.slice(0,count).map(([ii,si,pi,gi,fi])=>render(forms[fi],{
  intent:intents[ii],service:services[si].replaceAll("{skill}",skill),skill,area,
  platform:platforms[pi],geo:geos[gi].replaceAll("{area}",area)
 }));
 return reply({status:"ok",skill,country,city:city||null,area,queries,queryCount:queries.length,templateLibrarySize:capacity,templateLibraryVersion:"social-intent-v1",generatedAt:new Date().toISOString(),note:"This engine generates a large set of query combinations dynamically and selects a bounded batch for this search. It does not issue tens of thousands of provider calls."});
});