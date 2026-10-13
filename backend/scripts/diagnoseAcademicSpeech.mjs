import { createHash, randomBytes } from "node:crypto";
import WebSocket from "ws";
const client="6A5AA1D4EAFF4E9FB37E23D68491D6F4";
async function probe(voice, variant, skew=0) {
 const now=Date.now()+skew, ticks=BigInt(Math.floor((now/1000+11644473600)/300)*300)*10000000n;
 const hash=createHash("sha256").update(ticks+client).digest("hex").toUpperCase(), id=randomBytes(16).toString("hex");
 const url="wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1?Ocp-Apim-Subscription-Key="+client+"&ConnectionId="+id+"&Sec-MS-GEC="+hash+"&Sec-MS-GEC-Version=1-143.0.3650.75";
 return new Promise(resolve=>{
 const ws=new WebSocket(url,{handshakeTimeout:10000,maxPayload:2097152,headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",Origin:"chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold","Cache-Control":"no-cache",Pragma:"no-cache","Accept-Language":"en-US,en;q=0.9",Cookie:"muid="+randomBytes(16).toString("hex").toUpperCase()+";"}});
 let bytes=0, done=false;
 const finish=(info)=>{if(done)return;done=true;clearTimeout(timer);ws.terminate();resolve({voice,variant,bytes,...info});};
 const timer=setTimeout(()=>finish({result:"timeout"}),15000);
 ws.on("error",e=>finish({result:"transport_error",code:e.code??null}));
 ws.on("close",code=>finish({result:"closed",code}));
 ws.on("unexpected-response",(_req,res)=>{res.resume(); const provider=Date.parse(res.headers.date??"");finish({result:"handshake_rejected",httpStatus:res.statusCode,skew:Number.isFinite(provider)?provider-Date.now():null});});
 ws.on("open",()=>{
 const stamp=new Date().toString(), ssml='<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="'+(variant==="exact"?"en-US":"ar-IQ")+'"><voice name="'+voice+'"><prosody pitch="+0Hz" rate="+0%" volume="+0%">منصة القيادة الرقمية. مراجعة أكاديمية.</prosody></voice></speak>';
 const config={context:{synthesis:{audio:{metadataoptions:{sentenceBoundaryEnabled:"false",wordBoundaryEnabled:"false"},outputFormat:"audio-24khz-"+(variant==="legacy"?"96":"48")+"kbitrate-mono-mp3"}}}};
 ws.send("X-Timestamp:"+stamp+"\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n"+JSON.stringify(config)+"\r\n");
 ws.send("X-RequestId:"+id+"\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:"+stamp+(variant==="legacy"?"":"Z")+"\r\nPath:ssml\r\n\r\n"+ssml);
 });
 ws.on("message",(raw,binary)=>{const data=Buffer.from(raw);if(!binary){if(/^Path:turn\.end\r?$/m.test(data.toString()))finish({result:bytes?"audio":"empty"});return;}if(data.length<2)return;const n=data.readUInt16BE(0);if(n+2<=data.length&&/^Path:audio\r?$/m.test(data.subarray(2,n+2).toString()))bytes+=data.length-n-2;});
 });
}
for(const voice of ["ar-IQ-BasselNeural","ar-IQ-RanaNeural"])for(const variant of ["legacy","compatible","exact"]) {
 let result=await probe(voice,variant); console.log(JSON.stringify(result));
 if(result.httpStatus===403&&Number.isFinite(result.skew))console.log(JSON.stringify({...await probe(voice,variant,result.skew),clockCorrected:true}));
}
