async function api(p,o){
  const r=await fetch('/api'+p,{headers:{'Content-Type':'application/json'},...o});
  return r.json();
}

async function login(){
  await api('/login',{method:'POST',body:JSON.stringify({username:u.value,password:p.value})});
  app.style.display='block';
  const t=await api('/types');
  type.innerHTML=t.map(x=>`<option>${x}</option>`).join('');
}

async function sell(){
  out.textContent=JSON.stringify(
    await api('/sell',{method:'POST',body:JSON.stringify({
      type:type.value,
      numbers:nums.value,
      customer:{name:name.value,aadhar:aad.value}
    })}),null,2);
}
