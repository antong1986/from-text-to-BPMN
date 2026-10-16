const encoder = new TextEncoder();
const crcTable = (() => { const t=new Uint32Array(256); for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t; })();
function crc(bytes:Uint8Array){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
function zip(entries:{name:string;data:Uint8Array}[]):Uint8Array {
  const locals:Uint8Array[]=[], central:Uint8Array[]=[];let offset=0;
  entries.forEach(({name,data})=>{const nb=encoder.encode(name),sum=crc(data),local=new Uint8Array(30+nb.length),lv=new DataView(local.buffer);
    lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x800,true);lv.setUint32(14,sum,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,nb.length,true);local.set(nb,30);locals.push(local,data);
    const c=new Uint8Array(46+nb.length),v=new DataView(c.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint32(16,sum,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,nb.length,true);v.setUint32(42,offset,true);c.set(nb,46);central.push(c);offset+=local.length+data.length;});
  const size=central.reduce((s,p)=>s+p.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);
  const all=[...locals,...central,end],out=new Uint8Array(all.reduce((s,p)=>s+p.length,0));let at=0;all.forEach(p=>{out.set(p,at);at+=p.length;});return out;
}
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export function buildDocxFromMarkdown(markdown:string):Uint8Array {
  const body=markdown.split(/\r?\n/).filter(Boolean).map(line=>{
    const heading=/^(#{1,4})\s+(.*)/.exec(line), text=esc(heading?.[2]??line.replace(/^[-*]\s+/,''));
    return `<w:p><w:pPr>${heading?'<w:pStyle w:val="Heading1"/>':''}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  }).join('');
  const files=[
    {name:'[Content_Types].xml',data:encoder.encode('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')},
    {name:'_rels/.rels',data:encoder.encode('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')},
    {name:'word/document.xml',data:encoder.encode(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`)},
  ];
  return zip(files);
}
