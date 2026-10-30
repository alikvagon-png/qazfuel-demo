'use strict';
const fs=require('node:fs');const path=require('node:path');const tls=require('node:tls');const {X509Certificate}=require('node:crypto');const {Agent,fetch}=require('undici');
const rootPEM=fs.readFileSync(path.join(__dirname,'certs/russian-trusted-root.pem'),'utf8'),subPEM=fs.readFileSync(path.join(__dirname,'certs/russian-trusted-sub.pem'),'utf8');
const sub2024PEM=fs.readFileSync(path.join(__dirname,'certs/russian-trusted-sub-2024.pem'),'utf8');
const root=new X509Certificate(rootPEM),sub=new X509Certificate(subPEM),sub2024=new X509Certificate(sub2024PEM);
if(root.fingerprint256.replace(/:/g,'').toLowerCase()!=='d26d2d0231b7c39f92cc738512ba54103519e4405d68b5bd703e9788ca8ecf31'||!root.ca||!sub.ca||!root.verify(root.publicKey)||!sub.verify(root.publicKey)||!sub2024.ca||!sub2024.verify(root.publicKey))throw Error('rosstat_ca_integrity_failed');
const dispatcher=new Agent({connect:{ca:[...tls.rootCertificates,rootPEM,subPEM,sub2024PEM],rejectUnauthorized:true},connections:2});
async function fetchOfficial(url,options={}){const u=new URL(url);if(u.protocol!=='https:'||!['rosstat.gov.ru','www.rosstat.gov.ru'].includes(u.hostname)||u.port||u.username||u.password)throw Error('rosstat_invalid_transport_host');for(const cert of [root,sub,sub2024])if(Date.now()<Date.parse(cert.validFrom)||Date.now()>Date.parse(cert.validTo))throw Error('rosstat_ca_expired');return fetch(url,{...options,dispatcher,redirect:'manual'});}
module.exports={fetchOfficial,rootFingerprint:root.fingerprint256};
