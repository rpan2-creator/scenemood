
export function mountCinematicEffect(root) {

const hero=root.querySelector('.sm-hero');
const source=root.querySelector('.sm-backdrop');
const canvas=document.createElement('canvas');canvas.className='sm-live';canvas.setAttribute('aria-hidden','true');hero.prepend(canvas);
let disposed=false;
const gl=canvas.getContext('webgl',{alpha:false,antialias:false});
if(!gl){canvas.remove();return;}
const vertex='attribute vec2 p; varying vec2 uv; void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
const fragment=`precision highp float;
varying vec2 uv;uniform sampler2D art;uniform vec2 res;uniform vec2 imageSize;uniform vec2 pointer;uniform float effect;
float noise(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec3 sampleArt(vec2 p){if(p.x<0.||p.x>1.||p.y<0.||p.y>1.)return vec3(17.,17.,18.)/255.;return texture2D(art,p).rgb;}
void main(){
vec3 bg=vec3(17.,17.,18.)/255.;
float scale=min(res.x/imageSize.x,res.y/imageSize.y);vec2 size=imageSize*scale;
vec2 px=vec2(uv.x,1.-uv.y)*res;
vec2 origin=vec2((res.x-size.x)*.5,res.y-size.y);
vec2 q=(px-origin)/size;
vec3 col=sampleArt(q);
if(effect>.5){
vec2 offset=vec2((pointer.x-.5)*9.,(pointer.y-.5)*4.)/size;
vec3 shifted=vec3(sampleArt(q-offset).r,sampleArt(q).g,sampleArt(q+offset).b);
float lum=max(max(col.r,col.g),col.b);
float presence=smoothstep(.075,.21,lum);
float edge=smoothstep(0.,.09,q.x)*smoothstep(0.,.09,1.-q.x)*smoothstep(0.,.055,q.y)*smoothstep(0.,.06,1.-q.y);
float grain=(noise(gl_FragCoord.xy)-.5)*.055*presence;
col=mix(bg,max(shifted+grain,vec3(0.)),edge*presence);
}
gl_FragColor=vec4(col,1.);
}`;
function compile(type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
try{
const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Shader link failed');gl.useProgram(program);
const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const pos=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
const uniforms={};['res','imageSize','pointer','effect'].forEach(k=>uniforms[k]=gl.getUniformLocation(program,k));let active=true,ready=false,mx=.5,my=.5;
function draw(){if(!ready||disposed)return;gl.uniform2f(uniforms.res,canvas.width,canvas.height);gl.uniform2f(uniforms.imageSize,source.naturalWidth,source.naturalHeight);gl.uniform2f(uniforms.pointer,mx,my);gl.uniform1f(uniforms.effect,active?1:0);gl.drawArrays(gl.TRIANGLES,0,6);}
function resize(){const b=hero.getBoundingClientRect();const ratio=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(b.width*ratio);canvas.height=Math.round(b.height*ratio);gl.viewport(0,0,canvas.width,canvas.height);draw();}
function load(){if(disposed)return;gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,source);ready=true;hero.classList.add('sm-live-ready');resize();}
if(source.complete&&source.naturalWidth)load();else source.addEventListener('load',load,{once:true});
const observer=new ResizeObserver(resize);observer.observe(hero);
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');let pending=false;
const move=e=>{if(reduced.matches)return;const b=hero.getBoundingClientRect();mx=(e.clientX-b.left)/b.width;my=(e.clientY-b.top)/b.height;if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;draw();});}};
const leave=()=>{mx=.5;my=.5;draw();};hero.addEventListener('pointermove',move);hero.addEventListener('pointerleave',leave);

canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();hero.classList.remove('sm-live-ready');canvas.hidden=true;});
return ()=>{disposed=true;observer.disconnect();source.removeEventListener('load',load);hero.removeEventListener('pointermove',move);hero.removeEventListener('pointerleave',leave);gl.deleteTexture(tex);gl.deleteBuffer(buffer);gl.deleteProgram(program);canvas.remove();hero.classList.remove('sm-live-ready');};
}catch(e){canvas.remove();hero.classList.remove('sm-live-ready');}
}
