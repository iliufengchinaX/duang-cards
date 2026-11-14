import { LAYER } from './photos.js';
export const IDLE = 3;
export const TOUCHES = 8;
export const DROPS = 64;

const COMMON = `#version 300 es
precision highp float; precision highp int; precision highp sampler2DArray;
uniform highp sampler2D uFibS, uFibD;
uniform float uCW, uCH, uYB, uTime, uMotion;
uniform vec4 uPluck;      // line, age, amplitude, -
uniform vec4 uHover;      // line, amount, -, -
ivec2 at(int i){ return ivec2(i & 1023, i >> 10); }
float ss(float a, float b, float x){ float t=clamp((x-a)/(b-a),0.,1.); return t*t*(3.-2.*t); }
// Sideways motion of a fibre at height y: wind, the hand that parts it, and a pluck.
// uMotion keeps every movement roughly the same size on screen at any zoom.
float disp(float x0, float y, float idx, vec4 dy){
  float hang=clamp((uCH-y)/uCH,0.,1.);
  float anchor=ss(0.,.18,hang);
  float wind=(sin(uTime*.55+x0*.9+y*.21)*.035+sin(uTime*.31-x0*.37+y*.07)*.05)*hang*uMotion;
  if(abs(idx-uHover.x)<.5) wind*=1.-uHover.y;          // the thread under the hand holds still
  float d=(y-dy.y)/uMotion;
  float push=dy.x*exp(-d*d/(d>0.?3.:10.));
  float pl=0.;
  if(abs(idx-uPluck.x)<.5){
    float dist=(uCH-y)/uMotion, front=uPluck.y*10.;
    pl=uPluck.z*exp(-uPluck.y*1.4)*sin(dist*2.2-uPluck.y*14.)*ss(front+.1,front-2.5,dist);
  }
  return (wind+push+pl)*anchor;
}
`;

const NOISE = `
float hs(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int k=0;k<4;k++){ s+=a*vnoise(p); p=p*2.03+17.1; a*=.5; } return s; }
uint pcg(uint v){ uint s=v*747796405u+2891336453u; uint w=((s>>((s>>28u)+4u))^s)*277803737u; return (w>>22u)^w; }
float h2(int a, int b){ return float(pcg(uint(a)*1664525u^pcg(uint(b)+1013904223u)))/4294967295.; }
int imod(int a, int m){ int r=a%m; return r<0?r+m:r; }
`;

export const FIBRE_VS = COMMON + NOISE + `
layout(location=0) in vec2 aV;           // x: position along the fibre, y: side
uniform highp sampler2D uStory;
uniform vec3 uCam; uniform float uF, uAspect, uHpx, uMinPx, uMirror, uSpacing, uOpen;
uniform vec2 uRes;
uniform vec2 uSelect;                    // line, amount
uniform float uIdleL[${IDLE}], uIdleA[${IDLE}];
out float vU, vY, vX0, vSeed, vFlare, vSide, vHalfPx, vQuadPx, vNorm, vCl, vCl2, vSpacePx, vPpu, vXw;
flat out int vId; flat out float vN, vPhase, vHov, vSel, vFlowT; flat out vec3 vCol;
void main(){
  int i=gl_InstanceID;
  float fi=float(i);
  vec4 s=texelFetch(uFibS,at(i),0), dy=texelFetch(uFibD,at(i),0), st=texelFetch(uStory,at(i*3),0);
  const float UV=.86;
  float u=aV.x, flare=0.;
  vec3 p;
  if(u<UV){ p=vec3(s.x, uCH-(uCH-uYB)*(u/UV), 0.); }
  else {
    // The last stretch runs straight down into the water.
    flare=(u-UV)/(1.-UV);
    p=vec3(s.x, uYB*(1.-flare), 0.);
  }
  p.x+=disp(s.x,p.y,fi,dy)*(1.-flare*.7);
  float y=p.y;
  // Stage curtain. uOpen is 0 on the resting homepage, so this is skipped and the cloth
  // hangs exactly as before. As it opens, each strand is drawn sideways and bends with
  // the fold, gathering into a hem instead of being clipped by a straight edge.
  if(uOpen>0.001){
    float cdepth=max(uCam.z-p.z,0.25);
    float t=clamp(uOpen,0.,1.);
    float band=mix(110.,560.,t)*(uRes.x/1440.);
    float inner=t*(uRes.x*0.5+band);
    float rest=((p.x-uCam.x)*uF/(uAspect*cdepth)*0.5+0.5)*uRes.x;
    float sd=rest-uRes.x*0.5;
    float ad=abs(sd);
    float sgn=sd<0.?-1.:1.;
    float edge=inner+band;
    float inside=max(edge-ad,0.);
    float pull=inside*inside/(inside+band*0.55);
    float hemN=(ad+pull-edge)/(band*0.42);
    float hem=exp(-hemN*hemN);
    float fold=sin(y*1.15+sgn*0.8)*sin(y*0.38+2.1)*band*0.36*smoothstep(0.,.22,t);
    float drape=sin(y*0.72+s.y*6.283)*pull*0.24;
    float wpp=2.*uAspect*cdepth/(uF*max(uRes.x,1.));
    p.x+=(sgn*(pull+drape)+sgn*fold*hem)*wpp;
  }
  if(uMirror>.5) p.y=-p.y;
  float depth=uCam.z-p.z;
  float ppu=uF*uHpx*.5/max(depth,1e-4);
  float spacing=uSpacing*ppu;                         // px between neighbouring threads

  // How much this thread is being looked at: pointed to, glimmering by itself, or chosen.
  float hov=abs(fi-uHover.x)<.5?uHover.y:0.;
  for(int k=0;k<${IDLE};k++) if(abs(fi-uIdleL[k])<.5){ float a=uIdleA[k]; hov=max(hov,ss(0.,.7,a)*ss(3.2,1.8,a)*.85); }
  vHov=hov;
  vSel=abs(fi-uSelect.x)<.5?1.:0.;

  // Threads widen with zoom until each is exactly as wide as its photographs.
  float frac=mix(.14,.8,ss(2.,24.,spacing));
  float halfPx=max(uMinPx*.5,frac*spacing*.5)+hov*.75*(1.-ss(3.,12.,spacing));
  float quadPx=halfPx+1.;
  float off=aV.y*quadPx/ppu;
  p.x+=off;
  gl_Position=vec4((p.x-uCam.x)*uF/uAspect,(p.y-uCam.y)*uF,0.,depth);
  vNorm=clamp(spacing,.07,1.)*(1.+.7*ss(1.5,12.,spacing))*ss(.0,.02,depth/max(uCam.z,1e-4));
  // Light clouds drifting through the curtain, evaluated per vertex and interpolated.
  vCl=fbm(vec2(s.x*.19+uTime*.012, y*.13-uTime*.028));
  vCl2=fbm(vec2(s.x*.85-uTime*.02, y*.42+uTime*.035)+3.7);
  vU=u; vY=y; vX0=s.x; vSeed=s.y; vFlare=flare; vSide=aV.y; vHalfPx=halfPx; vQuadPx=quadPx;
  vSpacePx=spacing; vPpu=ppu; vXw=off; vId=i; vN=st.x; vCol=st.yzw; vPhase=dy.z; vFlowT=dy.w;
}`;

export const FIBRE_FS = COMMON + NOISE + `
uniform sampler2DArray uArr;
uniform highp sampler2D uStory, uLayers;
uniform float uCount;
uniform float uGain, uMirror, uIntro, uW, uS, uDim, uOpen;
uniform vec2 uSelect, uGlow, uRes;        // glow: x of the reaching hand, strength
in float vU, vY, vX0, vSeed, vFlare, vSide, vHalfPx, vQuadPx, vNorm, vCl, vCl2, vSpacePx, vPpu, vXw;
flat in int vId; flat in float vN, vPhase, vHov, vSel, vFlowT; flat in vec3 vCol;
out vec4 o;
void main(){
  float dist=abs(vSide)*vQuadPx;
  float cov=clamp(vHalfPx+.5-dist,0.,1.)*min(1.,vHalfPx*2.);
  if(cov<=0.) discard;
  float y=vY, cl=vCl, cl2=vCl2;

  // The curtain: deep amber, warming to gold where the light clouds gather.
  vec3 amber=vec3(.62,.3,.07), gold=vec3(.98,.66,.24), pale=vec3(1.,.86,.58);
  vec3 col=mix(amber,gold,ss(.35,.8,cl));
  // From afar only some threads carry light, so the curtain reads as separate dotted strands
  // falling through the dark; the rest is a faint warm haze. Up close every thread lights up.
  float far=1.-ss(1.2,5.,vSpacePx);
  float pick=h2(vId,4242);
  float strand=pick>.925?1.:pick>.78?.32:.012;
  // A brighter cluster where the child's hand reaches up.
  float reach=exp(-pow((vX0-uGlow.x)/1.2,2.))*uGlow.y;
  float column=exp(-pow((vX0-uGlow.x)/.3,2.))*uGlow.y;
  strand=max(strand,step(.72,pick)*.7*column);
  float I=(.3+.7*ss(.25,.85,cl)+.25*cl2)*(1.+.6*reach)*(.45+.9*ss(.3,.8,cl));
  float pleat=.7+.3*(.55+.3*cos(vX0*2.7+.8)+.15*cos(vX0*6.3+2.1));
  I*=(.3+1.35*vSeed*vSeed)*pleat*mix(1.,strand*.26,far);
  col=mix(col,pale,vFlare*.3);
  // Light rain: round specks and short dashes sliding down each fibre, slower than water.
  float q=(y+vFlowT*(.8+vSeed*.5))*5.5;
  float f=fract(q);
  float speck=step(mix(.972,.86-.1*reach,far*step(.3,strand)),h2(vId,int(floor(q))))*ss(0.,.1,f)*ss(.42,.12,f);
  float q2=(y+vFlowT*(1.1+vSeed*.3))*21.;
  float glit=step(.93,h2(vId+7919,int(floor(q2))))*ss(.5,0.,abs(fract(q2)-.5));
  float calm=1.-ss(10.,60.,vSpacePx);                 // specks would be metres long up close
  float sparkle=mix(1.,strand*(1.+.8*reach)*(.35+.9*cl),far);
  vec3 c=(col*I+mix(pale,gold,.35)*(speck*mix(3.4,5.,far)+glit*.7)*(.35+cl)*calm*sparkle)*vNorm*uGain;
  // Strands fade in from the dark above rather than hanging from a bar, and the last hand's
  // breadth above the water thins out: the light goes into the water as rings.
  c*=mix(1.,ss(uCH,uCH-3.5,y),far);
  c*=.25+.75*ss(0.,.55,y);

  // The stream: this thread's story, one photograph after another, flowing down.
  float reveal=max(ss(2.,10.,vSpacePx),vHov);
  if(reveal>.002 && vFlare<=0. && vN>=1.){
    float sc=(uCH-y)-vPhase;
    float slot=floor(sc/uS), local=sc-slot*uS;
    // Same rule as streamLayer() in stories.js: one picture per cell of a 14×14 block.
    int raw=imod(int(slot),14)*14+imod(vId,14);
    int layer=imod(raw*137+41,196);
    int n=max(int(uCount+.5),1);
    if(layer>=n) layer=imod(layer,n);
    float aspect=texelFetch(uLayers,ivec2(layer,0),0).x;
    float h=uW/aspect;
    float vp=(local-(uS-h)*.5)/h, up=.5+vXw/uW;
    float slotPx=uS*vPpu;
    float detail=ss(1.2,5.,slotPx);
    vec3 st=vCol*(.5+.35*cl);
    float inside=0., core=1.;
    if(detail>.001){
      float lod=log2(max(1.,${LAYER}./(min(uW,h)*vPpu)));
      vec3 img=textureLod(uArr,vec3(clamp(up,0.,1.),clamp(vp,0.,1.),layer),lod).rgb;
      // Seen through the curtain, every photograph takes a little of its gold.
      img=mix(img,img*vec3(1.1,.95,.74),.4*(1.-vHov));
      float e=1./max(h*vPpu,1.);
      inside=ss(0.,e,vp)*ss(1.,1.-e,vp)*ss(uYB,uYB+3.*uS,y)*ss(uCH,uCH-2.*uS,y);
      // Between moments only the thread itself remains, a hairline in its story's colour.
      core=clamp(1.2-abs(vXw)*vPpu,0.,1.);
      vec3 thread=vCol*(.3+.25*cl+.5*vHov)*core;
      st=mix(st,mix(thread,img,inside),detail);
    }
    st*=1.+vHov*.25*(1.-detail);
    // The curtain's own light keeps running along the thread between the pictures.
    c=mix(c,st*cov,reveal)+c*core*(1.-inside)*reveal*.75;
  }

  float front=uIntro*8.5-1.;
  c*=ss(front,front-3.,uCH-y);
  c*=vHov>.01?1.:1.-uDim;
  c*=mix(1.-uSelect.y,1.+uSelect.y*1.2,vSel);
  if(uMirror>.5) c*=exp(-y*.3)*(.55+.45*cl2);
  // Threads leave one by one across a wide hem. At rest uOpen is 0 and this is skipped.
  if(uOpen>0.001){
    float t=clamp(uOpen,0.,1.);
    float band=mix(110.,560.,t)*(uRes.x/1440.);
    float inner=t*(uRes.x*0.5+band);
    float dist=abs(gl_FragCoord.x-uRes.x*0.5);
    float g=clamp((dist-inner)/max(band,1.),0.,1.);
    float hsh=h2(vId,19);
    float fade=smoothstep(hsh*.25,hsh*.25+.72,g);
    float glint=step(.955,h2(vId+int(vY*3.),int(floor(uTime*2.5))))*fade*(1.-smoothstep(.12,.82,fade));
    c*=fade;
    c+=vec3(1.,.88,.52)*glint*2.6;
  }
  o=vec4(c,0.);
}`;

export const FLOOR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aC;
uniform vec3 uCam; uniform float uF, uAspect, uCW;
out vec3 vP;
void main(){
  vec3 p=vec3(aC.x*(uCW*.5+7.),0.,mix(-3.5,10.,aC.y*.5+.5));
  vP=p;
  gl_Position=vec4((p.x-uCam.x)*uF/uAspect,(p.y-uCam.y)*uF,0.,uCam.z-p.z);
}`;

export const FLOOR_FS = `#version 300 es
precision highp float;
` + NOISE + `
uniform float uTime, uCW, uGain, uIntro;
uniform vec2 uGlow;
uniform vec4 uFeet;                 // x, z of the child, ages of the last two footsteps
uniform vec4 uStep;                 // where those two footsteps were planted
uniform vec3 uTouch[${TOUCHES}];    // x, z, age of ripples left by the visitor's hand
uniform vec4 uDrop[${DROPS}];       // x, z, age, strength: a speck that has just reached the water
in vec3 vP;
out vec4 o;
float ss(float a,float b,float x){ float t=clamp((x-a)/(b-a),0.,1.); return t*t*(3.-2.*t); }
// One ring on the water: light on its crest, and the slope that bends the reflection.
vec2 ring(vec2 p, vec2 c, float age, float life, float speed, float amp){
  if(age<0. || age>life) return vec2(0.);
  float r=.03+age*speed, d=length(p-c), w=.012+.035*age;
  float k=(d-r)/w, fade=amp*pow(1.-age/life,2.)*ss(0.,.08,age);
  float env=exp(-k*k);
  float inner=exp(-pow((d-r*.62)/(w*1.3),2.))*.45;    // a second, weaker ring inside the first
  return vec2((env+inner)*fade, sin(k*2.4)*env*fade);
}
// How bright the curtain is just above a point on the waterline (same clouds as the fibres).
float curtainAt(float x){
  float cl=fbm(vec2(x*.19+uTime*.012, .07-uTime*.028));
  return (.25+ss(.3,.8,cl))*(1.+1.4*exp(-pow((x-uGlow.x)/1.2,2.))*uGlow.y);
}
void main(){
  vec2 p=vP.xz;
  float edge=ss(uCW*.5+3.5,uCW*.5-1.5,abs(p.x));
  float fore=exp(-max(p.y,0.)*.3), back=exp(-max(-p.y,0.)*1.4);
  float n=fbm(p*.28+vec2(uTime*.02,-uTime*.015));
  vec3 gold=vec3(1.,.72,.36);
  // The water is dark; near the curtain it carries a little of its light.
  vec3 c=mix(vec3(.4,.18,.03),vec3(.85,.55,.2),ss(.4,.75,n))*edge*fore*back*(.03+.03*n);
  c+=gold*exp(-p.y*p.y*6.)*edge*.05*curtainAt(p.x);

  // Rain: each ring starts where a falling speck met the water, at the foot of its strand.
  vec2 acc=vec2(0.);
  for(int i=0;i<${DROPS};i++){
    vec4 d=uDrop[i];
    if(d.z>1.5 || abs(p.x-d.x)>.7) continue;
    acc+=ring(p,d.xy,d.z,1.5,.4,d.w*curtainAt(d.x));
  }
  // The child's footsteps, and the visitor's hand on the water.
  acc+=ring(p,uStep.xy,uFeet.z,2.6,.38,.7);
  acc+=ring(p,uStep.zw,uFeet.w,2.6,.38,.7);
  for(int i=0;i<${TOUCHES};i++) acc+=ring(p,uTouch[i].xy,uTouch[i].z,3.,.55,.9);
  c+=mix(gold,vec3(1.,.9,.7),.4)*acc.x*.55*edge*fore;
  // The pool of light the child stands in.
  vec2 d=vec2(p.x-uFeet.x,(p.y-uFeet.y)*1.4);
  c+=gold*exp(-dot(d,d)*2.2)*.12*uGlow.y*(.8+.4*n);
  o=vec4(c*uGain*ss(1.2,3.,uIntro),.5+clamp(acc.y*.6,-.45,.45));
}`;

// The child: a filmed loop on green, keyed out here and lit by the curtain behind him.
export const CHILD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aC;
uniform vec3 uCam; uniform float uF, uAspect, uMirror, uZ;
uniform vec4 uRect;                      // left, bottom, width, height in the world
out vec2 vUv; out float vY;
void main(){
  vec3 p=vec3(uRect.x+aC.x*uRect.z, uRect.y+aC.y*uRect.w, uZ);
  vY=p.y; vUv=vec2(aC.x,1.-aC.y);
  if(uMirror>.5) p.y=-p.y;
  gl_Position=vec4((p.x-uCam.x)*uF/uAspect,(p.y-uCam.y)*uF,0.,uCam.z-p.z);
}`;

export const CHILD_FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uAlpha, uMirror, uH, uDirect;
in vec2 vUv; in float vY;
out vec4 o;
float ss(float a,float b,float x){ float t=clamp((x-a)/(b-a),0.,1.); return t*t*(3.-2.*t); }
float key(vec2 uv){
  vec3 c=texture(uTex,uv).rgb;
  // Green screen, and the warm glow the clip leaves in the air above him.
  // On skin the red runs well ahead of the green, so the figure stays.
  float gap=abs(c.r-c.g);
  float gold=ss(.48,.64,min(c.r,c.g))*ss(.48,.28,c.b)*ss(.25,.08,gap);
  return (1.-ss(.08,.26,c.g-max(c.r,c.b)))*(1.-gold);
}
void main(){
  if(vY<-.005) discard;
  vec3 c=texture(uTex,vUv).rgb;
  float a=key(vUv);
  if(a<.004) discard;
  c.g=min(c.g,max(c.r,c.b)*1.04);                       // no green fringe
  // His own colours stay. The rain passes behind him; it does not dye the cloth.
  // Only the outer edge lifts a little, in the colour that is already there.
  float n1=0.;
  for(int i=0;i<8;i++){
    float an=float(i)*.785398;
    n1+=key(vUv+vec2(cos(an),sin(an))*uTexel*3.);
  }
  float edge=a*(1.-n1/8.);
  vec3 col=c*vec3(.97,.94,.91)*(uDirect>.5?1.05:.5);
  col*=1.+edge*.18;
  col*=1.+.035*ss(.4,0.,vY);                            // a little light off the water, same hue
  if(uMirror>.5) col*=.55;
  o=vec4(col*a*uAlpha,a*uAlpha);
}`;

export const POST_VS = `#version 300 es
out vec2 vUv;
void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2))*2.-1.; vUv=p*.5+.5; gl_Position=vec4(p,0.,1.); }`;

export const DOWN_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uTexel;
in vec2 vUv; out vec4 o;
vec3 s(float x,float y){ return texture(uSrc,vUv+vec2(x,y)*uTexel).rgb; }
void main(){
  vec3 r=s(0.,0.)*.125
    +(s(-2.,2.)+s(2.,2.)+s(-2.,-2.)+s(2.,-2.))*.03125
    +(s(0.,2.)+s(-2.,0.)+s(2.,0.)+s(0.,-2.))*.0625
    +(s(-1.,1.)+s(1.,1.)+s(-1.,-1.)+s(1.,-1.))*.125;
  o=vec4(r,1.);
}`;

export const UP_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uTexel;
in vec2 vUv; out vec4 o;
vec3 s(float x,float y){ return texture(uSrc,vUv+vec2(x,y)*uTexel).rgb; }
void main(){
  vec3 r=(s(-1.,-1.)+s(1.,-1.)+s(-1.,1.)+s(1.,1.))+(s(0.,-1.)+s(0.,1.)+s(-1.,0.)+s(1.,0.))*2.+s(0.,0.)*4.;
  o=vec4(r/16.,1.);
}`;

export const BLUR_FS = `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uDir;
in vec2 vUv; out vec4 o;
void main(){
  vec3 r=texture(uSrc,vUv).rgb*.2270;
  r+=(texture(uSrc,vUv+uDir*1.3846).rgb+texture(uSrc,vUv-uDir*1.3846).rgb)*.3162;
  r+=(texture(uSrc,vUv+uDir*3.2308).rgb+texture(uSrc,vUv-uDir*3.2308).rgb)*.0703;
  o=vec4(r,1.);
}`;

export const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform sampler2D uScene, uBloom, uRefl;
uniform float uBloomK, uReflK, uFloorV, uTime, uHasRefl, uOpen;
uniform vec2 uRes;
in vec2 vUv; out vec4 o;
float hash(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
vec3 tone(vec3 c){ vec3 k=vec3(.7); vec3 over=max(c-k,0.); return min(c,k)+(1.-k)*(1.-exp(-over/(1.-k))); }
void main(){
  vec2 uv=vUv;
  vec4 sc=texture(uScene,uv);
  vec3 c=sc.rgb;
  if(uHasRefl>.5){
    float below=clamp((uFloorV-uv.y)*uRes.y*.25,0.,1.);
    float depth=max(uFloorV-uv.y,0.);
    float rip=sin(uv.y*uRes.y*.085+uTime*1.2)*.6+sin(uv.y*uRes.y*.027-uTime*.7)*.4;
    // The floor pass leaves the slope of its ripples in alpha; it bends the reflection.
    float slope=(sc.a-.5)*below;
    vec2 ruv=uv+vec2(rip*.0025*min(depth*6.,1.)+slope*.018,slope*.03);
    c+=texture(uRefl,ruv).rgb*uReflK*below*(1.+slope*.8);
  }
  c+=texture(uBloom,uv).rgb*uBloomK;
  c=tone(c);
  vec2 d=(uv-.5)*vec2(uRes.x/uRes.y,1.);
  c*=mix(1.,smoothstep(1.3,.3,length(d)),.55);
  float g=hash(gl_FragCoord.xy+fract(uTime*7.13)*113.)-.5;
  c+=g*.03;
  float cover=1.;
  if(uOpen>0.001){
    float t=clamp(uOpen,0.,1.);
    float band=mix(110.,560.,t)*(uRes.x/1440.);
    float inner=t*(uRes.x*0.5+band);
    float dist=abs(gl_FragCoord.x-uRes.x*0.5);
    float gg=clamp((dist-inner)/max(band,1.),0.,1.);
    float h=hash(vec2(floor(gl_FragCoord.x*.35),floor(gl_FragCoord.y*.02)));
    cover=clamp(smoothstep(-.02,1.02,gg)+(h-.5)*.07*sin(3.14159*clamp(gg,0.,1.)),0.,1.);
    float spark=step(.993,hash(floor(gl_FragCoord.xy*vec2(.07,.035))+floor(uTime*4.)))*cover*(1.-cover);
    c+=vec3(1.,.9,.55)*spark*3.2;
    c*=cover;
  }
  o=vec4(max(c,0.)*cover,cover);
}`;
