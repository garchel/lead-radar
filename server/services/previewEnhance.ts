/**
 * Aprimoramento de movimento da prévia (fases 1 a 3).
 *
 * A página continua sendo um arquivo só, sem dependência externa: o JavaScript
 * entra embutido, escrito aqui (não pelo modelo) e com orçamento de bytes. O
 * modelo só precisa deixar o palco pronto.
 *
 * Fase 1: fundo animado (shader), revelação por rolagem, barra de progresso,
 *         feedback de toque.
 * Fase 2: título que se monta palavra por palavra, parallax leve, contador.
 * Fase 3: cabeçalho que aparece ao subir, inclinação de cartão no ponteiro.
 *
 * Tudo respeita `prefers-reduced-motion`, cai para nada sem WebGL e pausa
 * quando o canvas sai da tela — o portão de desempenho reprova abaixo de 30fps.
 */

export interface OpcoesAprimoramento {
  fase?: 1 | 2 | 3;
  /** Cores da marca (hex), usadas no shader. */
  cores?: string[];
}

const CSS = [
  ".fx-canvas{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;opacity:.9}",
  "[data-fx-host]{position:relative;isolation:isolate;overflow:hidden}",
  "[data-fx-host]>*:not(.fx-canvas){position:relative;z-index:1}",
  ".fx-bar{position:fixed;top:0;left:0;height:2px;width:100%;transform:scaleX(0);transform-origin:0 50%;",
  "background:var(--accent,#b8892b);z-index:60;pointer-events:none;opacity:.85}",
  ".fx-rev{opacity:0;transform:translate3d(0,22px,0);",
  "transition:opacity .7s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}",
  ".fx-rev.fx-in{opacity:1;transform:none}",
  ".fx-press{transform:scale(.975)}",
  ".fx-nav{transition:transform .35s cubic-bezier(.2,.7,.2,1);will-change:transform}",
  ".fx-nav.fx-up{transform:translateY(-102%)}",
  ".fx-tilt{transition:transform .35s cubic-bezier(.2,.7,.2,1);transform-style:preserve-3d}",
  "@media (prefers-reduced-motion: reduce){.fx-rev{opacity:1!important;transform:none!important;transition:none!important}",
  ".fx-canvas{display:none}}",
].join("");

/** Script embutido. Sem template literal dentro: só concatenação. */
function script(cores: string[], fase: number): string {
  return [
    "(function(){",
    "var w=window,d=document;if(w.__fx)return;w.__fx=1;",
    "var reduz=w.matchMedia&&w.matchMedia('(prefers-reduced-motion: reduce)').matches;",
    "var FASE=" + fase + ";",
    "var CORES=" + JSON.stringify(cores) + ";",
    "d.documentElement.classList.add('fx-on');",
    // barra de progresso
    "var bar=d.createElement('div');bar.className='fx-bar';d.body.appendChild(bar);",
    // cabeçalho (fase 3)
    "var nav=FASE>=3?d.querySelector('header'):null;",
    "if(nav){nav.classList.add('fx-nav');}",
    // elementos para revelar: blocos de conteúdo, nunca o primeiro bloco visível
    "var alvos=[].slice.call(d.querySelectorAll('section, article, figure, table, blockquote, ul')).filter(function(e){",
    "  var r=e.getBoundingClientRect();return r.height>60&&r.top>w.innerHeight*0.9;});",
    "if(!reduz){alvos.forEach(function(e){e.classList.add('fx-rev');});}",
    "var io=w.IntersectionObserver?new IntersectionObserver(function(ents){",
    "  ents.forEach(function(en){if(en.isIntersecting){en.target.classList.add('fx-in');io.unobserve(en.target);}});",
    "},{rootMargin:'0px 0px -8% 0px'}):null;",
    "if(io){alvos.forEach(function(e){io.observe(e);});}else{alvos.forEach(function(e){e.classList.add('fx-in');});}",
    // contador (fase 2)
    "if(FASE>=2&&!reduz){",
    "  [].slice.call(d.querySelectorAll('[data-count], .rating, .nota, strong')).forEach(function(e){",
    "    var t=(e.textContent||'').trim();var m=t.match(/^(\\d{1,3}(?:[.,]\\d)?)/);",
    "    if(!m||t.replace(m[1],'').trim().length>18)return;",
    "    var alvo=parseFloat(m[1].replace(',','.'));if(!isFinite(alvo))return;",
    "    var io2=w.IntersectionObserver?new IntersectionObserver(function(en2){",
    "      if(!en2[0].isIntersecting)return;io2.disconnect();var i=0;",
    "      var passo=function(){i++;var v=alvo*i/18;",
    "        e.textContent=t.replace(m[1],(m[1].indexOf(',')>-1?v.toFixed(1):String(Math.round(v))));",
    "        if(i<18)requestAnimationFrame(passo);else e.textContent=t;};requestAnimationFrame(passo);",
    "    },{threshold:.6}):null;if(io2)io2.observe(e);",
    "  });",
    "}",
    // título palavra por palavra (fase 2)
    "if(FASE>=2&&!reduz){var h1=d.querySelector('h1');",
    "  if(h1&&h1.children.length===0){var palavras=(h1.textContent||'').trim().split(/\\s+/);",
    "    h1.textContent='';palavras.forEach(function(p,i){var s=d.createElement('span');",
    "      s.textContent=p+' ';s.style.display='inline-block';s.style.opacity='0';",
    "      s.style.transform='translateY(14px)';s.style.transition='opacity .5s ease '+(i*60)+'ms,transform .5s ease '+(i*60)+'ms';",
    "      h1.appendChild(s);requestAnimationFrame(function(){s.style.opacity='1';s.style.transform='none';});});}",
    "}",
    // parallax + barra + nav no scroll
    "var ultimo=0,alvosPar=FASE>=2?[].slice.call(d.querySelectorAll('[data-fx-host] figure, [data-fx-host] img, [data-fx-host] [data-slot]')):[];",
    "function quadro(){",
    "  var h=d.documentElement.scrollHeight-w.innerHeight;var y=w.scrollY||w.pageYOffset;",
    "  bar.style.transform='scaleX('+(h>0?Math.min(1,y/h):0)+')';",
    "  if(nav){if(y>420&&y>ultimo){nav.classList.add('fx-up');}else{nav.classList.remove('fx-up');}}",
    "  if(alvosPar.length){for(var i=0;i<alvosPar.length;i++){var e=alvosPar[i];var r=e.getBoundingClientRect();",
    "    var p=(w.innerHeight-r.top)/(w.innerHeight+r.height);if(p>-0.2&&p<1.2){",
    "      e.style.transform='translate3d(0,'+((p-0.5)*14).toFixed(2)+'px,0)';}}}",
    "  ultimo=y;",
    "}",
    "var pendente=false;function pedir(){if(pendente)return;pendente=true;requestAnimationFrame(function(){pendente=false;quadro();});}",
    "w.addEventListener('scroll',pedir,{passive:true});quadro();",
    // feedback de toque
    "d.addEventListener('pointerdown',function(ev){var a=ev.target.closest&&ev.target.closest('a,button');",
    "  if(!a)return;a.classList.add('fx-press');setTimeout(function(){a.classList.remove('fx-press');},140);},{passive:true});",
    // inclinação do cartão (fase 3, ponteiro fino)
    "if(FASE>=3&&w.matchMedia('(hover:hover) and (pointer:fine)').matches){",
    "  [].slice.call(d.querySelectorAll('section:nth-of-type(2) article, .card, .cartao')).slice(0,4).forEach(function(c){",
    "    c.classList.add('fx-tilt');",
    "    c.addEventListener('pointermove',function(ev){var r=c.getBoundingClientRect();",
    "      var dx=(ev.clientX-r.left)/r.width-.5,dy=(ev.clientY-r.top)/r.height-.5;",
    "      c.style.transform='perspective(700px) rotateY('+(dx*5).toFixed(2)+'deg) rotateX('+(-dy*5).toFixed(2)+'deg)';});",
    "    c.addEventListener('pointerleave',function(){c.style.transform='';});});",
    "}",
    // shader
    "var cv=d.querySelector('canvas.fx-canvas');",
    "if(cv&&!reduz){",
    "  var gl=cv.getContext('webgl',{antialias:false,alpha:true,depth:false,powerPreference:'low-power'});",
    "  if(!gl){cv.remove();}else{",
    "    var vs='attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';",
    "    var fs='precision mediump float;uniform float t;uniform vec2 r;uniform vec3 c1;uniform vec3 c2;uniform vec3 c3;'",
    "      +'float n(vec2 p){return fract(sin(dot(p,vec2(41.7,289.1)))*43758.5);}'",
    "      +'float sm(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);'",
    "      +'float a=n(i),b=n(i+vec2(1.,0.)),c=n(i+vec2(0.,1.)),d2=n(i+vec2(1.,1.));return mix(mix(a,b,f.x),mix(c,d2,f.x),f.y);}'",
    "      +'void main(){vec2 uv=gl_FragCoord.xy/r;float x=uv.x*1.4,y=uv.y;float v=0.;float a=.5;'",
    "      +'for(int i=0;i<4;i++){v+=a*sm(vec2(x*2.2+t*.06,y*2.6-t*.05)*1.6+float(i));a*=.55;}'",
    "      +'vec3 col=mix(c1,c2,smoothstep(.25,.85,v));col=mix(col,c3,smoothstep(.55,1.,v)*.7);'",
    "      +'float g=(n(gl_FragCoord.xy+t)-.5)*.025;col+=g;'",
    "      +'gl_FragColor=vec4(col,.55);}';",
    "    function sh(tp,src){var s=gl.createShader(tp);gl.shaderSource(s,src);gl.compileShader(s);",
    "      if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))return null;return s;}",
    "    var v=sh(gl.VERTEX_SHADER,vs),f=sh(gl.FRAGMENT_SHADER,fs);",
    "    if(!v||!f){cv.remove();}else{",
    "      var pr=gl.createProgram();gl.attachShader(pr,v);gl.attachShader(pr,f);gl.linkProgram(pr);",
    "      if(!gl.getProgramParameter(pr,gl.LINK_STATUS)){cv.remove();}else{",
    "        gl.useProgram(pr);",
    "        var buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);",
    "        gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);",
    "        var loc=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(loc);",
    "        gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);",
    "        function cor(hex,i){var h=(hex||'').replace('#','');if(h.length!==6)return [.5,.5,.5][i]||.5;",
    "          var n2=parseInt(h.substr(i*2,2),16)/255;return n2;}",
    "        var base=CORES.length?CORES:['#1b3a6b','#b8892b','#f4efe6'];",
    "        var u1=gl.getUniformLocation(pr,'c1'),u2=gl.getUniformLocation(pr,'c2'),u3=gl.getUniformLocation(pr,'c3');",
    "        gl.uniform3f(u1,cor(base[0],0),cor(base[0],1),cor(base[0],2));",
    "        gl.uniform3f(u2,cor(base[1%base.length],0),cor(base[1%base.length],1),cor(base[1%base.length],2));",
    "        gl.uniform3f(u3,cor(base[2%base.length],0),cor(base[2%base.length],1),cor(base[2%base.length],2));",
    "        var ut=gl.getUniformLocation(pr,'t'),ur=gl.getUniformLocation(pr,'r');",
    "        var escala=.55,visivel=true,rodando=false,quadros=0,lento=0;",
    "        function medir(){var wc=cv.clientWidth||1,hc=cv.clientHeight||1;",
    "          var k=Math.min(1,wc>700?0.75:0.55);cv.width=Math.max(2,Math.round(wc*k*escala));",
    "          cv.height=Math.max(2,Math.round(hc*k*escala));gl.viewport(0,0,cv.width,cv.height);",
    "          gl.uniform2f(ur,cv.width,cv.height);}",
    "        medir();w.addEventListener('resize',function(){medir();},{passive:true});",
    "        var t0=performance.now();",
    "        function loop(){if(!visivel){rodando=false;return;}rodando=true;",
    "          var agora=performance.now();var dt=agora-t0;t0=agora;",
    "          quadros++;if(dt>22){lento++;if(lento>20&&escala>.3){escala*=.7;medir();lento=0;}}else if(lento>0){lento--;}",
    "          gl.uniform1f(ut,performance.now()/1000);",
    "          gl.drawArrays(gl.TRIANGLE_STRIP,0,4);requestAnimationFrame(loop);}",
    "        if(w.IntersectionObserver){new IntersectionObserver(function(en){visivel=en[0].isIntersecting;",
    "          if(visivel&&!rodando)loop();},{threshold:0}).observe(cv);}else{loop();}",
    "        loop();",
    "      }",
    "    }",
    "  }",
    "}",
    "})();",
  ].join("\n");
}

/** Acha o bloco do herói e devolve onde encaixar o palco do shader. */
function acharPalco(html: string): { abre: string; indice: number } | null {
  const posH1 = html.search(/<h1[\s>]/i);
  if (posH1 < 0) return null;
  const antes = html.slice(0, posH1);
  const m = [...antes.matchAll(/<(section|header|main)\b[^>]*>/gi)].pop();
  if (!m || m.index === undefined) return null;
  return { abre: m[0], indice: m.index + m[0].length };
}

export function aprimorarPagina(html: string, opts: OpcoesAprimoramento = {}): { html: string; features: string[] } {
  const fase = opts.fase ?? 3;
  if (fase <= 0) return { html, features: [] };
  if (/class="fx-canvas"/.test(html)) return { html, features: [] };

  const features: string[] = [];
  let saida = html;

  // Palco do shader dentro do herói (o único bloco que sempre existe).
  const palco = acharPalco(saida);
  if (palco) {
    const canvas = '<canvas class="fx-canvas" aria-hidden="true"></canvas>';
    const tagComAtributo = palco.abre.includes("data-fx-host")
      ? palco.abre
      : palco.abre.replace(/>$/, ' data-fx-host="1">');
    saida = saida.replace(palco.abre, tagComAtributo + canvas);
    features.push("fundo animado no hero");
  }

  // CSS e script entram antes de </body>.
  const estilo = "<style>" + CSS + "</style>";
  const js = "<script>" + script(opts.cores || [], fase) + "</script>";
  if (/<\/body>/i.test(saida)) {
    saida = saida.replace(/<\/body>/i, estilo + js + "</body>");
  } else {
    saida += estilo + js;
  }

  features.push("barra de progresso");
  if (fase >= 1) features.push("revelação por rolagem", "feedback de toque");
  if (fase >= 2) features.push("título palavra por palavra", "parallax", "contador");
  if (fase >= 3) features.push("cabeçalho ao subir", "inclinação de cartão");

  return { html: saida, features };
}
