const ISOTOPES=[170,171,172,173,174,176]

const MASS={
170:169.9347664,
171:170.9363302,
172:171.9363859,
173:172.9382151,
174:173.9388664,
176:175.9425717
}

function mu(mA,mref){
return mA*mref/Math.abs(mA-mref)
}

async function load(tr){

let r=await fetch("data/"+tr+".json")
let j=await r.json()

let map={}

for(let d of j.data){
map[d.isotope]=d.average
}

return map
}

function linearFit(x,y){

let n=x.length

let sx=0
let sy=0
let sxx=0
let sxy=0

for(let i=0;i<n;i++){

sx+=x[i]
sy+=y[i]
sxx+=x[i]*x[i]
sxy+=x[i]*y[i]

}

let b=(n*sxy-sx*sy)/(n*sxx-sx*sx)
let a=(sy-b*sx)/n

return {a:a,b:b}

}

async function plot(){

let tx=document.getElementById("tx").value
let ty=document.getElementById("ty").value
let ref=parseInt(document.getElementById("ref").value)

if(tx==ty){
alert("X and Y must be different")
return
}

let dx=await load(tx)
let dy=await load(ty)

let nu_x_ref=dx[ref]
let nu_y_ref=dy[ref]

let x=[]
let y=[]
let label=[]

for(let A in dx){

A=parseInt(A)

if(A==ref)continue
if(!(A in dy))continue

let dnu_x=dx[A]-nu_x_ref
let dnu_y=dy[A]-nu_y_ref

let muA=mu(MASS[A],MASS[ref])

x.push(muA*dnu_x)
y.push(muA*dnu_y)
label.push(A)

}

let fit=linearFit(x,y)

let xmin=Math.min(...x)
let xmax=Math.max(...x)

let xx=[]
let yy=[]

for(let i=0;i<200;i++){

let t=xmin+(xmax-xmin)*i/200

xx.push(t)
yy.push(fit.a+fit.b*t)

}

Plotly.newPlot("plot",[

{
x:x,
y:y,
mode:"markers+text",
text:label,
textposition:"top right",
type:"scatter",
name:"Isotopes"
},

{
x:xx,
y:yy,
mode:"lines",
type:"scatter",
name:"Fit"
}

],
{
title:"King Plot: "+ty+" vs "+tx,
xaxis:{title:"μΔν ("+tx+")"},
yaxis:{title:"μΔν ("+ty+")"}
}
)

}
