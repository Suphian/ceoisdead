import * as THREE from 'three';

/** Original miniature architecture. All geometry is shared and owned by this factory. */
export function createLandmarks() {
  const geometries = {
    box: new THREE.BoxGeometry(1,1,1),
    cylinder: new THREE.CylinderGeometry(1,1,1,12),
    roof: new THREE.ConeGeometry(1,1,4),
    cone: new THREE.ConeGeometry(1,1,12),
    ball: new THREE.IcosahedronGeometry(1,1),
    ring: new THREE.TorusGeometry(1,.12,5,24),
    arch: new THREE.TorusGeometry(1,.16,5,12,Math.PI),
  };
  const colors = { stone:0xe3d2a6, trim:0xf3e4c1, roof:0xa65f45, roofLight:0xc8815c, wood:0x78583b, window:0x415855, gold:0xba9951, sage:0x597665, blue:0x587e87, burgundy:0x9b5b50, skin:0xcb9568, hair:0x665242, leaf:0x54755a };
  const materials=Object.fromEntries(Object.entries(colors).map(([name,color])=>[name,new THREE.MeshStandardMaterial({color,roughness:name==='gold'?.5:.86,metalness:name==='gold'?.36:0,flatShading:true})]));
  function add(parent,shape,material,x,y,z,sx,sy=sx,sz=sx) { const mesh=new THREE.Mesh(geometries[shape],materials[material]);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh; }
  const box=(p,m,x,y,z,w,h,d)=>add(p,'box',m,x,y,z,w,h,d);
  function roof(parent,x,y,z,width,depth,height,light=false) { const r=add(parent,'roof',light?'roofLight':'roof',x,y,z,width*.72,height,depth*.72);r.rotation.y=Math.PI/4;return r; }
  function window(parent,x,y,z,w=.06,h=.1) { box(parent,'window',x,y,z,w,h,.012);box(parent,'trim',x,y-h/2,z+.008,w+.025,.018,.022); }
  function house(parent,x,z,size=1,angle=0) {
    const h=new THREE.Group();h.position.set(x,0,z);h.rotation.y=angle;h.scale.setScalar(size);parent.add(h);
    box(h,'stone',0,.16,0,.31,.32,.27);roof(h,0,.39,0,.42,.38,.20);
    box(h,'wood',0,.08,.141,.065,.16,.015);window(h,-.09,.20,.143,.05,.07);window(h,.09,.20,.143,.05,.07);
    box(h,'wood',0,.285,.142,.32,.018,.02);box(h,'wood',-.135,.165,.14,.018,.28,.02);box(h,'wood',.135,.165,.14,.018,.28,.02);
    box(h,'stone',.10,.43,-.02,.054,.19,.065);return h;
  }
  function tower(parent,x,z,height=.65,radius=.15,pointed=true) {
    add(parent,'cylinder','stone',x,height/2,z,radius,height,radius);
    add(parent,'cylinder','trim',x,height-.04,z,radius*1.1,.08,radius*1.1);
    window(parent,x,height*.63,z+radius,.06,.11);
    if(pointed)add(parent,'cone','roof',x,height+.14,z,radius*1.28,.32,radius*1.28);
    else for(let i=0;i<6;i++){const a=i/6*Math.PI*2;box(parent,'trim',x+Math.cos(a)*radius*.88,height+.035,z+Math.sin(a)*radius*.88,.07,.10,.07);}
  }
  function pennant(parent,x,y,z,color='burgundy') {
    box(parent,'gold',x,y,z,.012,.40,.012);const flag=box(parent,color,x+.067,y+.11,z,.14,.09,.015);parent.userData.flags.push(flag);
    add(parent,'ball','gold',x,y+.215,z,.022);return flag;
  }
  function person(parent,x,z,color,phase) {
    const p=new THREE.Group();p.position.set(x,.03,z);parent.add(p);
    add(p,'cone',color,0,.068,0,.036,.115,.033);add(p,'ball','skin',0,.15,0,.034,.039,.034);add(p,'ball','hair',0,.171,-.009,.035,.025,.034);
    box(p,'wood',-.014,.007,0,.015,.035,.025);box(p,'wood',.014,.007,0,.015,.035,.025);
    p.userData={x,z,phase};parent.userData.people.push(p);
  }
  function cypress(parent,x,z,size=1) { box(parent,'wood',x,.12*size,z,.025,.24*size,.025);add(parent,'ball','leaf',x,.31*size,z,.09*size,.28*size,.09*size); }
  function medieval(parent,index) {
    switch(index%4) {
      case 0:
        tower(parent,-.09,-.02,.70,.17,false);house(parent,.18,.13,.63);box(parent,'stone',-.18,.16,.19,.41,.30,.08);window(parent,-.06,.14,.237,.10,.18);pennant(parent,-.09,.94,-.02);break;
      case 1:
        house(parent,-.16,-.06,1.15);house(parent,.23,.10,.78,-.2);house(parent,.04,-.27,.58,.15);pennant(parent,-.16,.73,-.06,'sage');break;
      case 2: {
        tower(parent,-.08,-.04,.52,.16,true);house(parent,.20,.14,.72);
        const sails=new THREE.Group();sails.position.set(-.08,.48,.17);parent.add(sails);parent.userData.sails=sails;
        for(let i=0;i<4;i++){const arm=new THREE.Group();arm.rotation.z=i*Math.PI/2;sails.add(arm);box(arm,'wood',0,.15,0,.018,.36,.02);box(arm,'trim',.035,.21,.009,.065,.18,.014);}
        add(parent,'ball','gold',-.08,.48,.20,.037);break;
      }
      case 3:
        box(parent,'stone',0,.25,0,.49,.50,.35);roof(parent,0,.57,0,.56,.44,.19);tower(parent,-.25,.12,.52,.10);tower(parent,.25,.12,.60,.10);
        window(parent,0,.19,.18,.11,.23);window(parent,-.14,.34,.18);window(parent,.14,.34,.18);pennant(parent,.25,.99,.12,'blue');break;
    }
  }
  function roman(parent,index) {
    if(index%3===0){
      box(parent,'stone',0,.025,0,.73,.05,.55);box(parent,'trim',0,.075,0,.66,.045,.49);
      box(parent,'stone',0,.27,-.07,.39,.36,.26);
      for(const x of[-.25,-.08,.08,.25])for(const z of[-.19,.19]){
        add(parent,'cylinder','trim',x,.285,z,.028,.37,.028);add(parent,'cylinder','stone',x,.10,z,.048,.04,.048);box(parent,'trim',x,.485,z,.077,.05,.077);
      }
      box(parent,'trim',0,.52,0,.68,.055,.51);roof(parent,0,.60,0,.74,.60,.15);window(parent,0,.23,.071,.10,.23);
    }else if(index%3===1){
      const arch=add(parent,'arch','trim',0,.34,0,.24,.24,.12);arch.rotation.z=0;
      for(const x of[-.24,.24]){box(parent,'stone',x,.18,0,.10,.36,.20);box(parent,'trim',x,.03,0,.15,.055,.25);}
      box(parent,'stone',0,.61,0,.63,.11,.22);box(parent,'trim',0,.68,0,.68,.035,.27);
      house(parent,-.21,-.26,.65);cypress(parent,.33,-.16,1.1);pennant(parent,0,.88,0,'burgundy');
    }else{
      add(parent,'cylinder','stone',0,.055,0,.34,.11,.28);
      for(let i=0;i<12;i++){const a=i/12*Math.PI*2;const x=Math.cos(a)*.28,z=Math.sin(a)*.23;box(parent,'trim',x,.22,z,.055,.28,.055);}
      const rim=add(parent,'ring','stone',0,.37,0,.29,.25,.29);rim.rotation.x=Math.PI/2;
      box(parent,'stone',0,.045,0,.17,.08,.15);cypress(parent,-.37,.13,.9);cypress(parent,.34,-.20,1);
    }
  }
  function make(index,theme='medieval') {
    const parent=new THREE.Group();parent.userData={flags:[],people:[],sails:null};
    if(theme==='roman')roman(parent,index);else medieval(parent,index);
    person(parent,-.28,.32,index%2?'blue':'sage',index*.7);person(parent,.30,.27,index%2?'burgundy':'sage',index*.7+2);
    if(index%2===0)cypress(parent,.32,-.18,.75);
    return parent;
  }
  function animate(group,time,reduced=false) {
    if(reduced)return;
    for(const flag of group.userData.flags)flag.rotation.y=Math.sin(time*1.6+flag.position.x)*.18;
    for(const p of group.userData.people){const a=time*.18+p.userData.phase;p.position.x=p.userData.x+Math.sin(a)*.06;p.position.z=p.userData.z+Math.cos(a)*.035;p.rotation.y=a+Math.PI/2;p.position.y=.03+Math.abs(Math.sin(time*3+p.userData.phase))*.006;}
    if(group.userData.sails)group.userData.sails.rotation.z=time*.27;
  }
  return {make,animate,dispose(){Object.values(geometries).forEach(g=>g.dispose());Object.values(materials).forEach(m=>m.dispose());}};
}
