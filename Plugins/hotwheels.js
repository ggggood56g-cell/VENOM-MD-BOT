import { publicHttp } from "../src/lib/network.js";

let mergedCommands = ["hotwheels","hw"];

export default {

name:"hotwheels",
alias:[...mergedCommands],
uniquecommands:[...mergedCommands],
description:"Get random Hot Wheels",

start: async (Venom,m,{inputCMD})=>{

switch(inputCMD){

case "hotwheels":
case "hw":

try{

const { data } = await publicHttp.get("https://hot-wheels-rugs.onrender.com/api/random", {
  timeout: 20_000,
  maxContentLength: 256 * 1024,
})

const image = data.imgUrl

await Venom.sendMessage(
m.from,
{
image:{url:image},
caption:`🏎 Venom-MD Hot Wheels

Name: ${data.name}
Model: ${data.model}
Series: ${data.series}
Year: ${data.year}`
},
{ quoted:m }
)

}catch(e){

await Venom.sendMessage(
m.from,
{ text:"❌ Venom-MD failed to fetch Hot Wheels."},
{ quoted:m }
)

}

break

default:
break

}

}

}