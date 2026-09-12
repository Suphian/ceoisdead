import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

  const COLORS=[0x68bed0,0xe7b34d,0xd57968];
  const LAYOUT=[[-.75,-4.0,1.04],[ -.85,-2.1,1.15],[-1.6,-.1,1.16],[1.0,-.55,1.20],[-3.25,1.70,1.08],[-.75,1.95,1.21],[1.83,2.05,1.10],[-1.73,4.01,1.08]];
  const MODELS=['campus','atrium','factory','campus','atrium','tower-twin','tower','tower'];
  const TAU=Math.PI*2;
  const mix=(a,b,t)=>a+(b-a)*t;
  function polygon(radius,index=0) {
    const shape=new THREE.Shape(),points=[];
    for(let i=0;i<8;i++){const a=i/8*TAU+.2;const r=radius*(1+Math.sin(i*3.7+index)*.10);points.push(new THREE.Vector2(Math.cos(a)*r,Math.sin(a)*r));}
    shape.moveTo(points[0].x,points[0].y);points.slice(1).forEach(p=>shape.lineTo(p.x,p.y));shape.closePath();return{shape,points};
  }
  function slab(shape,height,bevel=.04) {
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,steps:1,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,curveSegments:12});
    geometry.rotateX(-Math.PI/2);return geometry;
  }
  function roundedRect(w,h,r) {
    const s=new THREE.Shape(),x=-w/2,z=-h/2;
    s.moveTo(x+r,z);s.lineTo(x+w-r,z);s.quadraticCurveTo(x+w,z,x+w,z+r);s.lineTo(x+w,z+h-r);s.quadraticCurveTo(x+w,z+h,x+w-r,z+h);s.lineTo(x+r,z+h);s.quadraticCurveTo(x,z+h,x,z+h-r);s.lineTo(x,z+r);s.quadraticCurveTo(x,z,x+r,z);return s;
  }
  export function createBoardScene(container,{onRegionClick=()=>{}}={}) {
    const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65));
    renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.14;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    const canvas=renderer.domElement;canvas.className='board-webgl';canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none';
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Living three-dimensional succession board. Drag to orbit and scroll to zoom. Keyboard-accessible division buttons are below.');
    container.append(canvas);
    const world=new THREE.Scene();
    const camera=new THREE.OrthographicCamera(-8,8,8,-8,.1,100);
    const defaultPosition=new THREE.Vector3(9.2,14.5,16.5),defaultTarget=new THREE.Vector3(-.55,.75,.15);
    camera.position.copy(defaultPosition);
    const controls=new OrbitControls(camera,canvas);controls.target.copy(defaultTarget);controls.enableDamping=true;controls.dampingFactor=.09;
    controls.enableDamping=!reduceMotion;controls.enablePan=false;controls.minZoom=.72;controls.maxZoom=2.3;controls.minPolarAngle=.08;controls.maxPolarAngle=1.12;controls.rotateSpeed=.5;controls.zoomSpeed=.65;controls.update();
    const pmrem=new THREE.PMREMGenerator(renderer),environmentScene=new RoomEnvironment();
    const environmentTarget=pmrem.fromScene(environmentScene,.04);world.environment=environmentTarget.texture;world.environmentIntensity=.25;
    environmentScene.dispose();pmrem.dispose();
    const ambient=new THREE.HemisphereLight(0xcfe7ef,0x173434,1.4);world.add(ambient);
    const sun=new THREE.DirectionalLight(0xffdec0,3.8);sun.position.set(-5,9,6);
    sun.castShadow=true;const shadowSize=container.clientWidth<700?1024:2048;sun.shadow.mapSize.set(shadowSize,shadowSize);Object.assign(sun.shadow.camera,{left:-9,right:9,top:10,bottom:-10,near:.5,far:35});
    sun.shadow.bias=-.00018;sun.shadow.normalBias=.025;sun.shadow.radius=3;world.add(sun);
    const rim=new THREE.DirectionalLight(0x9cdce8,1.4);rim.position.set(6,5,-7);world.add(rim);
    const mats={
      dark:new THREE.MeshStandardMaterial({color:0x122027,roughness:.68,metalness:.2}),
      brass:new THREE.MeshStandardMaterial({color:0xb79355,roughness:.29,metalness:.76}),
      cliff:new THREE.MeshStandardMaterial({color:0x657477,roughness:.94}),
      cliffLight:new THREE.MeshStandardMaterial({color:0x9daca6,roughness:.92}),
      sand:new THREE.MeshStandardMaterial({color:0xd7c7a4,roughness:.94}),
      grass:new THREE.MeshStandardMaterial({color:0x6d9169,roughness:.95}),
      path:new THREE.MeshStandardMaterial({color:0xb6afa0,roughness:.98}),
      bark:new THREE.MeshStandardMaterial({color:0x654b39,roughness:.94}),
      leaves:new THREE.MeshStandardMaterial({color:0x3f755d,roughness:.89}),
      leavesLight:new THREE.MeshStandardMaterial({color:0x629064,roughness:.96}),
      stone:new THREE.MeshStandardMaterial({color:0x899791,roughness:1}),
      timber:new THREE.MeshStandardMaterial({color:0x947048,roughness:.9}),
      sail:new THREE.MeshStandardMaterial({color:0xf5e7c9,roughness:.8,side:THREE.DoubleSide}),
      glass:new THREE.MeshPhysicalMaterial({color:0x82bac4,roughness:.2,metalness:.25,clearcoat:.65}),
      light:new THREE.MeshBasicMaterial({color:0xffd59a}),
      pieces:COLORS.map(c=>new THREE.MeshPhysicalMaterial({color:c,roughness:.27,metalness:.2,clearcoat:.85,clearcoatRoughness:.14})),
    };
    const shared={
      box:new THREE.BoxGeometry(1,1,1),
      trunk:new THREE.CylinderGeometry(.035,.05,.34,5),
      pine:new THREE.ConeGeometry(.25,.64,6),
      rock:new THREE.DodecahedronGeometry(1,0),
      disc:new THREE.CylinderGeometry(.135,.15,.065,16),
      gem:new THREE.OctahedronGeometry(.135,0),
      pawn:new THREE.LatheGeometry([new THREE.Vector2(.075,0),new THREE.Vector2(.12,.025),new THREE.Vector2(.09,.06),new THREE.Vector2(.05,.18),new THREE.Vector2(.085,.22),new THREE.Vector2(.085,.26),new THREE.Vector2(.04,.28)],12),
      tower:new THREE.CylinderGeometry(.10,.125,.25,6),
      cap:new THREE.ConeGeometry(.135,.17,4),
    };
    const mesh=(geometry,material,parent,x=0,y=0,z=0)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
    const box=(parent,material,x,y,z,w,h,d)=>{const m=mesh(shared.box,material,parent,x,y,z);m.scale.set(w,h,d);return m;};
    const board=new THREE.Group();board.position.set(-.6,0,.1);world.add(board);
    mesh(slab(roundedRect(11.5,13.15,.48),.34,.08),mats.dark,board,0,-.79,0);
    mesh(slab(roundedRect(11.39,13.04,.44),.055,.02),mats.brass,board,0,-.425,0);
    mesh(slab(roundedRect(11.30,12.95,.42),.20,.035),mats.dark,board,0,-.36,0);
    const waterMaterial=new THREE.MeshPhysicalMaterial({color:0x146075,roughness:.24,metalness:.30,clearcoat:.8,clearcoatRoughness:.25});
    let waterShader=null;
    waterMaterial.onBeforeCompile=shader=>{
      shader.uniforms.uTime={value:0};waterShader=shader;
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uTime;\nvarying vec3 vWaterWorld;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y += sin(position.x*3.0+uTime*.6)*.009 + sin(position.z*4.0-position.x*1.6+uTime*.42)*.006;')
        .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvWaterWorld = (modelMatrix * vec4(transformed,1.0)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float uTime;\nvarying vec3 vWaterWorld;')
        .replace('#include <color_fragment>','#include <color_fragment>\nfloat ripple=sin(vWaterWorld.x*8.0+vWaterWorld.z*5.0+uTime*.9)*sin(vWaterWorld.z*11.0-vWaterWorld.x*3.0-uTime*.5);\ndiffuseColor.rgb *= .90 + ripple*.045;')
        .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nnormal = normalize(normal + vec3(sin(vWaterWorld.x*7.0+vWaterWorld.z*2.0+uTime*.6)*.045,cos(vWaterWorld.z*9.0+uTime*.5)*.025,0.0));');
    };
    const waterGeometry=new THREE.PlaneGeometry(11.15,12.8,90,100);waterGeometry.rotateX(-Math.PI/2);
    const water=mesh(waterGeometry,waterMaterial,board,0,-.09,0);water.castShadow=false;

    const nodes=new Map(),pickables=[],flights=[],ripples=[],models=new Map(),lamps=[],boats=[];
    const forestTrunks=new THREE.InstancedMesh(shared.trunk,mats.bark,96),forestCrowns=new THREE.InstancedMesh(shared.pine,mats.leaves,96),forestTops=new THREE.InstancedMesh(shared.pine,mats.leavesLight,96);
    for(const m of[forestTrunks,forestCrowns,forestTops]){m.castShadow=true;m.receiveShadow=true;world.add(m);}
    const rockField=new THREE.InstancedMesh(shared.rock,mats.stone,80);rockField.castShadow=true;rockField.receiveShadow=true;world.add(rockField);
    for(const field of[forestTrunks,forestCrowns,forestTops,rockField])field.frustumCulled=false;
    const dummy=new THREE.Object3D();let treeCount=0,rockCount=0,disposed=false,selected=null,hovered=null,firstUpdate=true,view='3d',night=false,previousCourts=[];
    const clock=new THREE.Clock();let frame=0,lastFrame=0,cameraTween=null,lastRegions=[],dirty=true;
    const labelTextures=new Set();
    function label(text,subtitle) {
      const c=document.createElement('canvas');c.width=512;c.height=136;const g=c.getContext('2d');
      g.fillStyle='#132f38e8';g.beginPath();g.roundRect(25,12,462,112,18);g.fill();
      g.strokeStyle='#b6995c99';g.lineWidth=2;g.stroke();
      g.fillStyle='#f1e7cf';g.textAlign='center';g.textBaseline='middle';g.font='600 41px Georgia';g.fillText(String(text).slice(0,24),256,subtitle?48:66,440);
      g.fillStyle='#dfbd81';g.font='600 18px Arial';g.fillText(String(subtitle).toUpperCase(),256,94,440);
      const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;labelTextures.add(t);
      const m=new THREE.SpriteMaterial({map:t,depthTest:false,depthWrite:false,transparent:true});
      const s=new THREE.Sprite(m);s.scale.set(2.06,.547,1);s.renderOrder=10;return s;
    }
    function tree(x,z,scale=1){
      if(treeCount>=96)return;
      dummy.position.set(x,.40,z);dummy.rotation.set(0,x*2,0);dummy.scale.setScalar(scale);dummy.updateMatrix();forestTrunks.setMatrixAt(treeCount,dummy.matrix);
      dummy.position.y=.74;dummy.updateMatrix();forestCrowns.setMatrixAt(treeCount,dummy.matrix);
      dummy.position.y=1.01;dummy.scale.setScalar(scale*.68);dummy.updateMatrix();forestTops.setMatrixAt(treeCount,dummy.matrix);treeCount++;
    }
    function rock(x,y,z,s=.2){
      if(rockCount>=80)return;dummy.position.set(x,y,z);dummy.rotation.set(x*.4,z,.2);dummy.scale.set(s,s*.65,s*.85);dummy.updateMatrix();rockField.setMatrixAt(rockCount++,dummy.matrix);
    }
    function makePawn(f) {
      const group=new THREE.Group();
      mesh(shared.disc,mats.brass,group,0,.033,0);
      if(f===0){const p=mesh(shared.gem,mats.pieces[f],group,0,.20,0);p.scale.y=1.30;p.rotation.y=Math.PI/4;}
      if(f===1){mesh(shared.pawn,mats.pieces[f],group,0,.064,0);}
      if(f===2){mesh(shared.tower,mats.pieces[f],group,0,.18,0);mesh(shared.cap,mats.pieces[f],group,0,.37,0);}
      return group;
    }
    function pawnPosition(slot){return new THREE.Vector3(-.40+(slot%4)*.28,.335+Math.floor(slot/8)*.37,.35+Math.floor(slot%8/4)*.27);}
    const loader=new GLTFLoader();
    const loadModels=Promise.all([...new Set(MODELS)].map(async name=>{
      try{
        const gltf=await loader.loadAsync(new URL('./assets/models/'+name+'.glb',import.meta.url).href);
        if(disposed)return;
        gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.material){o.material.roughness=.70;o.material.metalness=.06;o.material.envMapIntensity=.35;}}});
        models.set(name,gltf.scene);
        for(const node of nodes.values())if(MODELS[node.index]===name)putLandmark(node);
      }catch(e){container.dataset.assetWarning='Some landmarks could not load';console.warn('Landmark unavailable:',name,e.message);}
    })).then(()=>{if(!disposed)container.dataset.assets=models.size===new Set(MODELS).size?'ready':'partial';});
    function putLandmark(node){
      const source=models.get(MODELS[node.index]);if(!source)return;
      if(node.building)node.group.remove(node.building);
      const building=source.clone(true),bounds=new THREE.Box3().setFromObject(building),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      const targetWidth=node.index===5?.56:.68;const scale=targetWidth/Math.max(size.x,size.z);
      building.position.set(-center.x*scale-.13,.335-bounds.min.y*scale,-center.z*scale-.32);
      building.scale.setScalar(scale);building.rotation.y=node.index%2?.4:-.2;node.group.add(building);node.building=building;
      dirty=true;
    }
    function buildRegion(region,index) {
      const [x,z,r]=LAYOUT[index],group=new THREE.Group();group.position.set(x,0,z);world.add(group);
      const {shape,points}=polygon(r,index);
      const low=mesh(slab(shape,.23,.07),mats.cliff,group,0,-.14,0);
      const mid=mesh(slab(shape,.14,.045),mats.cliffLight,group,0,.08,0);mid.scale.set(.96,1,.96);
      const beach=mesh(slab(shape,.055,.035),mats.sand,group,0,.245,0);beach.scale.set(.92,1,.92);
      const turfMaterial=mats.grass.clone();turfMaterial.color.offsetHSL(index*.005,0,(index%3-1)*.018);
      const turf=mesh(slab(shape,.025,.025),turfMaterial,group,0,.303,0);turf.scale.set(.81,1,.81);
      [low,mid,beach,turf].forEach(o=>{o.userData.regionId=region.id;pickables.push(o);});
      const road=mesh(new THREE.RingGeometry(.30,.36,32),mats.path,group,-.14,.336,-.25);road.rotation.x=-Math.PI/2;road.scale.set(1,1.2,1);road.castShadow=false;
      const ringGeometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p.x*1.04,.285,-p.y*1.04)));
      const outline=new THREE.LineLoop(ringGeometry,new THREE.LineBasicMaterial({color:0xffdc89,transparent:true,opacity:0}));group.add(outline);
      const shore=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(p.x*1.10,-.095,-p.y*1.10))),new THREE.LineBasicMaterial({color:0xb3e9dc,transparent:true,opacity:.23}));group.add(shore);
      const target=mesh(new THREE.RingGeometry(r*.89,r*.94,64),new THREE.MeshBasicMaterial({color:0xffcf76,transparent:true,opacity:.3,side:THREE.DoubleSide,depthWrite:false}),group,0,.365,0);target.rotation.x=-Math.PI/2;target.castShadow=false;target.visible=false;
      const node={group,index,region,turfMaterial,outline,shore,target,pawns:new Map(),counts:[0,0,0],label:null,name:'',signature:'',building:null,banner:null,lift:0};
      nodes.set(region.id,node);
      for(let i=0;i<7;i++){const a=Math.PI*.82+i*.18;const rad=r*(.55+(i%2)*.15);tree(x+Math.cos(a)*rad,z+Math.sin(a)*rad,.52+(i%3)*.10);}
      for(let i=0;i<5;i++){const a=index*.7+i*1.1;rock(x+Math.cos(a)*r*.99,.025,z+Math.sin(a)*r*.99,.10+(i%3)*.05);}
      // A little jetty and mooring light establish a physical shoreline.
      box(group,mats.timber,r*.77,.29,.15,.55,.045,.17);
      for(let i=0;i<6;i++)box(group,mats.sand,r*.57+i*.085,.316,.15,.012,.006,.17);
      for(const side of[-.085,.085])box(group,mats.bark,r*.96,.10,.15+side,.025,.38,.025);
      const bulb=mesh(new THREE.SphereGeometry(.034,8,6),mats.light,group,r*.96,.44,.24);bulb.visible=false;lamps.push(bulb);
      putLandmark(node);return node;
    }
    function sailboat(x,z,scale,angle) {
      const group=new THREE.Group();group.position.set(x,-.075,z);group.rotation.y=angle;group.scale.setScalar(scale);world.add(group);
      const hull=mesh(new THREE.CapsuleGeometry(.08,.26,3,6),mats.timber,group,0,.055,0);hull.rotation.x=Math.PI/2;hull.scale.set(1,.95,.48);
      box(group,mats.bark,0,.24,0,.017,.42,.017);
      const sail=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(.015,.12,0),new THREE.Vector3(.015,.40,0),new THREE.Vector3(.19,.13,0)]);sail.computeVertexNormals();mesh(sail,mats.sail,group);
      boats.push({group,x,z,angle});return group;
    }
    sailboat(3.47,-2.8,1.35,-.4);sailboat(-4.45,-1.8,1.05,2.6);sailboat(3.2,4.4,.9,.9);
    // Small unclaimed islets make the frame feel like an archipelago.
    for(let i=0;i<8;i++)rock(3.95+Math.sin(i*3)*.34,-.07,-4.8+i*.20,.12+(i%3)*.09);
    const benchPositions=[new THREE.Vector3(-3.35,.2,5.58),new THREE.Vector3(2.85,.2,5.4),new THREE.Vector3(3.55,.2,-4.8),new THREE.Vector3(-3.75,.2,-4.8)];
    const benches=benchPositions.map((p,i)=>{
      const bench=new THREE.Group();world.add(bench);bench.visible=i<2;
      mesh(slab(roundedRect(1.85,.63,.12),.06,.02),mats.brass,bench,p.x,-.1,p.z);
      for(let f=0;f<3;f++){const pawn=makePawn(f);pawn.position.set(p.x-.5+f*.5,0,p.z);pawn.scale.setScalar(.78);bench.add(pawn);}
      return bench;
    });
    const dustGeometry=new THREE.BufferGeometry(),dustPositions=[];
    for(let i=0;i<36;i++)dustPositions.push(Math.sin(i*31.1)*5,1+(i%7)*.35,Math.cos(i*21.7)*5.6);
    dustGeometry.setAttribute('position',new THREE.Float32BufferAttribute(dustPositions,3));
    const dust=new THREE.Points(dustGeometry,new THREE.PointsMaterial({color:0xffdfa2,size:.018,transparent:true,opacity:.27,depthWrite:false}));world.add(dust);
    function getWorld(mesh){mesh.updateWorldMatrix(true,false);return mesh.getWorldPosition(new THREE.Vector3());}
    function fly(object,from,to,parent,local,remove=false,delay=0){
      for(const f of flights)if(f.object===object)f.done=true;
      world.attach(object);object.position.copy(from);
      flights.push({object,from:from.clone(),to:to.clone(),parent,local:local?.clone(),remove,start:clock.getElapsedTime()+delay,duration:reduceMotion?.01:.65,done:false});
    }
    function clearLabel(node){if(node.label){node.group.remove(node.label);node.label.material.map.dispose();labelTextures.delete(node.label.material.map);node.label.material.dispose();node.label=null;}}
    function update(state,selectedRegion=null){
      if(disposed)return;selected=typeof selectedRegion==='object'?selectedRegion?.id:selectedRegion;
      benches.forEach((bench,i)=>bench.visible=i<(state.courts?.length??2));
      const regions=state.regions??[];lastRegions=regions;
      const removed=[];
      for(const region of regions){
        const node=nodes.get(region.id)||buildRegion(region,regions.indexOf(region));
        for(let f=0;f<3;f++)for(let c=Math.max(0,region.cubes[f]);c<node.counts[f];c++){
          const id=f+'-'+c,object=node.pawns.get(id);if(object){removed.push({f,object,from:getWorld(object)});node.pawns.delete(id);}
        }
      }
      for(const region of regions){
        const node=nodes.get(region.id);node.region=region;
        const signature=[region.name,region.controller,region.unstable,region.resolved,region.current].join('|');
        if(signature!==node.signature){
          node.signature=signature;clearLabel(node);
          node.label=label(region.name,region.unstable?'DEADLOCK':region.resolved?'SETTLED':region.current?'IN CONTEST':'');node.label.position.set(0,.52,.94);node.group.add(node.label);
          if(region.resolved&&!node.banner){
            const banner=new THREE.Group();banner.position.set(.51,.34,-.36);node.group.add(banner);node.banner=banner;
            box(banner,mats.brass,0,.32,0,.023,.65,.023);
            const material=region.unstable?mats.dark:mats.pieces[region.controller];
            box(banner,material,.13,.53,0,.26,.16,.025);
            if(!firstUpdate){banner.scale.setScalar(.01);banner.userData.rise=clock.getElapsedTime();}
          }else if(!region.resolved&&node.banner){node.group.remove(node.banner);node.banner=null;}
        }
        let slot=0;
        for(let f=0;f<3;f++)for(let c=0;c<Math.min(18,region.cubes[f]);c++){
          const id=f+'-'+c,target=pawnPosition(slot++);let pawn=node.pawns.get(id);
          if(!pawn){
            pawn=makePawn(f);pawn.position.copy(target);node.group.add(pawn);node.pawns.set(id,pawn);
            if(!firstUpdate){
              const transferIndex=removed.findIndex(p=>p.f===f);
              let from;
              if(transferIndex>=0){const old=removed.splice(transferIndex,1)[0];from=old.from;for(const flight of flights)if(flight.object===old.object)flight.done=true;old.object.removeFromParent();}
              else from=new THREE.Vector3(4.7,.25,-4.8);
              const to=node.group.localToWorld(target.clone());fly(pawn,from,to,node.group,target,false,slot*.012);
            }
          }else{
            const flight=flights.find(a=>a.object===pawn&&!a.done);
            if(flight){flight.local.copy(target);flight.to.copy(node.group.localToWorld(target.clone()));}
            else pawn.position.copy(target);
          }
        }
        node.counts=region.cubes.slice();
      }
      for(const item of removed){
        const recipient=(state.courts??[]).findIndex((court,i)=>court[item.f]>(previousCourts[i]?.[item.f]??court[item.f]));
        const destination=recipient<0?new THREE.Vector3(4.7,.25,-4.8):benchPositions[recipient].clone().add(new THREE.Vector3(0,.5,0));
        fly(item.object,item.from,destination,null,null,true);
      }
      previousCourts=(state.courts??[]).map(c=>c.slice());
      for(const m of[forestTrunks,forestCrowns,forestTops]){m.count=treeCount;m.instanceMatrix.needsUpdate=true;}rockField.count=rockCount;rockField.instanceMatrix.needsUpdate=true;
      firstUpdate=false;dirty=true;
    }
    const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();let start=null;
    function pick(event){const r=canvas.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects(pickables,false)[0]?.object.userData.regionId??null;}
    function down(e){if(e.isPrimary===false||e.button>0){start=null;return;}cameraTween=null;start={x:e.clientX,y:e.clientY,id:e.pointerId,moved:false};}
    function move(e){if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>7)start.moved=true;hovered=pick(e);canvas.style.cursor=hovered?'pointer':'grab';dirty=true;}
    function up(e){if(!start||start.id!==e.pointerId)return;const moved=start.moved||Math.hypot(e.clientX-start.x,e.clientY-start.y)>7;start=null;if(!moved){const id=pick(e);if(id)onRegionClick(id);}}
    function leave(){start=null;hovered=null;dirty=true;}
    function lost(e){e.preventDefault();container.dispatchEvent(new CustomEvent('board-context-lost',{bubbles:true}));}
    const listeners={pointerdown:down,pointermove:move,pointerup:up,pointerleave:leave,pointercancel:leave,webglcontextlost:lost};
    Object.entries(listeners).forEach(([type,fn])=>canvas.addEventListener(type,fn));
    controls.addEventListener('start',()=>cameraTween=null);
    controls.addEventListener('change',()=>dirty=true);
    function tweenCamera(position,target,zoom=1){
      cameraTween={from:camera.position.clone(),to:position.clone(),targetFrom:controls.target.clone(),targetTo:target.clone(),zoomFrom:camera.zoom,zoomTo:zoom,start:clock.getElapsedTime()};
    }
    function setView(next){
      view=next==='top'?'top':'3d';controls.enableRotate=view!=='top';controls.minPolarAngle=view==='top'?0:.08;
      tweenCamera(view==='top'?new THREE.Vector3(-.55,24,.151):defaultPosition,defaultTarget,1);
    }
    function focusRegion(id){
      const node=nodes.get(id);if(!node)return;
      const target=new THREE.Vector3(node.group.position.x,.2,node.group.position.z);
      const offset=camera.position.clone().sub(controls.target);tweenCamera(target.clone().add(offset),target,1.65);
    }
    function setLighting(value){night=value==='night';dirty=true;}
    let nightBlend=0;
    function resize(){
      const width=Math.max(1,container.clientWidth),height=Math.max(1,container.clientHeight),aspect=width/height;
      const half=aspect<1?7.7/aspect:7.7;
      camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();renderer.setSize(width,height,false);dirty=true;
    }
    const observer=new ResizeObserver(resize);observer.observe(container);resize();
    function animate(now){
      if(disposed)return;frame=requestAnimationFrame(animate);if(document.hidden||document.querySelector('dialog[open]'))return;
      if(reduceMotion&&!dirty&&!flights.length&&!cameraTween)return;
      if(!dirty&&now-lastFrame<1000/(container.clientWidth<700?30:45))return;lastFrame=now;
      const t=clock.getElapsedTime();
      if(waterShader)waterShader.uniforms.uTime.value=reduceMotion?0:t;
      if(!reduceMotion){boats.forEach((b,i)=>{b.group.position.y=-.07+Math.sin(t*.8+i)*.012;b.group.rotation.z=Math.sin(t*.7+i)*.025;});dust.rotation.y=t*.012;}
      nightBlend=mix(nightBlend,night?1:0,reduceMotion?1:.045);
      ambient.intensity=mix(1.4,.70,nightBlend);sun.intensity=mix(3.8,.36,nightBlend);rim.intensity=mix(1.4,2.1,nightBlend);
      sun.color.setRGB(mix(1,.48,nightBlend),mix(.73,.67,nightBlend),mix(.53,1,nightBlend));
      renderer.toneMappingExposure=mix(1.14,.98,nightBlend);world.environmentIntensity=mix(.25,.13,nightBlend);lamps.forEach(l=>l.visible=nightBlend>.3);
      for(const[id,node]of nodes){
        node.group.position.y=0;
        node.target.visible=id===selected||node.region.current;node.target.material.opacity=id===selected?.60:.20+(reduceMotion?0:Math.sin(t*1.5)*.06);
        node.outline.material.opacity=id===selected?1:id===hovered?.75:node.region.current?.48:0;
        node.shore.material.opacity=.15+(reduceMotion?0:Math.sin(t*.7+node.index)*.07);
        if(node.banner?.userData.rise!==undefined){const k=Math.min(1,(t-node.banner.userData.rise)/.5);node.banner.scale.setScalar(reduceMotion?1:1-Math.pow(1-k,3));if(k===1)delete node.banner.userData.rise;}
      }
      for(const f of flights){
        if(f.done)continue;const k=Math.max(0,Math.min(1,(t-f.start)/f.duration));const ease=k*k*(3-2*k);
        f.object.position.lerpVectors(f.from,f.to,ease);f.object.position.y+=Math.sin(k*Math.PI)*1.35;f.object.rotation.y=k*TAU*.35;
        if(f.remove)f.object.scale.setScalar(Math.max(.01,1-k*.75));
        if(k===1){f.done=true;if(f.remove)f.object.removeFromParent();else{f.parent.add(f.object);f.object.position.copy(f.local);f.object.rotation.y=0;}}
      }
      for(let i=flights.length-1;i>=0;i--)if(flights[i].done)flights.splice(i,1);
      if(cameraTween){
        const a=cameraTween,k=reduceMotion?1:Math.min(1,(t-a.start)/.8),e=1-Math.pow(1-k,3);
        camera.position.lerpVectors(a.from,a.to,e);controls.target.lerpVectors(a.targetFrom,a.targetTo,e);camera.zoom=mix(a.zoomFrom,a.zoomTo,e);camera.updateProjectionMatrix();if(k===1)cameraTween=null;
      }
      controls.update();renderer.render(world,camera);dirty=false;
      container.dataset.triangles=String(renderer.info.render.triangles);container.dataset.drawCalls=String(renderer.info.render.calls);
    }
    animate(0);
    function dispose(){
      if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();controls.dispose();Object.entries(listeners).forEach(([t,f])=>canvas.removeEventListener(t,f));
      const geometries=new Set(Object.values(shared)),materials=new Set(Object.values(mats).flat()),textures=new Set(labelTextures);
      const collect=root=>root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of(Array.isArray(o.material)?o.material:o.material?[o.material]:[])){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
      collect(world);models.forEach(collect);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());sun.shadow.dispose();environmentTarget.dispose();renderer.dispose();canvas.remove();
    }
    return{update,setView,focusRegion,setLighting,dispose};
  }
