const axios = require('axios');
const logger = require('../utils/logger');
const BASE_URL = 'https://api.airtable.com/v0';
const BASE_ID = process.env.AIRTABLE_BASE_ID || 'apptgY5Qc6HvgZKB8';
const CONTENT_TABLE = process.env.AIRTABLE_CONTENT_TABLE || 'tblf5fgfaqVGZXwyW';
const AVATAR_TABLE = process.env.AIRTABLE_AVATAR_TABLE || 'tbloFkuAXiMH1tbxd';
function getHeaders(){return{Authorization:`Bearer ${process.env.AIRTABLE_TOKEN}`,'Content-Type':'application/json'};}
async function airtableRequest(method,path,data=null){
  try{
    const url=`${BASE_URL}/${BASE_ID}/${path}`;
    const config={method,url,headers:getHeaders(),timeout:15000};
    if(data&&method.toUpperCase()!=='GET')config.data=data;
    const r=await axios(config);return r.data;
  }catch(err){
    const msg=err.response?.data?.error?.message||err.message;
    logger.error(`Airtable ${method} ${path} failed: ${msg}`);
    throw new Error(`Airtable error: ${msg}`);
  }
}
async function createContentRecord(fields){const r=await airtableRequest('POST',CONTENT_TABLE,{fields,typecast:true});logger.info(`Airtable record created: ${r.id}`);return r;}
async function updateContentRecord(recordId,fields){const r=await airtableRequest('PATCH',`${CONTENT_TABLE}/${recordId}`,{fields,typecast:true});return r;}
async function getContentRecord(recordId){return airtableRequest('GET',`${CONTENT_TABLE}/${recordId}`);}
async function searchContentRecords(formula,fields=null,maxRecords=100){
  const p=new URLSearchParams();p.set('filterByFormula',formula);
  if(maxRecords)p.set('maxRecords',String(maxRecords));
  if(fields)fields.forEach(f=>p.append('fields[]',f));
  const r=await airtableRequest('GET',`${CONTENT_TABLE}?${p.toString()}`);
  return r.records||[];
}
async function isDuplicate(url){
  try{
    if(!url)return false;
    const safe=url.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
    const formula=`{URL}="${safe}"`;
    const records=await searchContentRecords(formula,['Title'],1);
    return records.length>0;
  }catch(err){logger.warn(`Dedup check failed: ${err.message} — assuming not duplicate`);return false;}
}
async function getPendingRecords(){return searchContentRecords(`{Status}="New"`,null,50);}
async function getAvatars(){const r=await airtableRequest('GET',AVATAR_TABLE);return r.records||[];}
async function getRandomAvatar(){
  const a=await getAvatars();
  if(!a.length)throw new Error('No avatars');
  // Prefer avatars that have voice samples for voice-cloned TTS
  const withVoice=a.filter(r=>{const va=r.fields?.['Voice Sample'];return va&&va.length>0;});
  const pool=withVoice.length?withVoice:a;
  const p=pool[Math.floor(Math.random()*pool.length)];
  if(!withVoice.length)logger.warn('[Airtable] No avatars have voice samples — TTS will use generic voice');
  return normalizeAvatar(p);
}
async function getAvatarByName(name){const safe=name.replace(/"/g,'\\"');const p=new URLSearchParams({filterByFormula:`{Name}="${safe}"`,maxRecords:'1'});const r=await airtableRequest('GET',`${AVATAR_TABLE}?${p}`);const records=r.records||[];if(!records.length)throw new Error(`Avatar "${name}" not found`);return normalizeAvatar(records[0]);}
async function createAvatar(name,imageUrl,voiceUrl=null){const fields={Name:name};if(imageUrl)fields['Avatar Image']=[{url:imageUrl}];if(voiceUrl)fields['Voice Sample']=[{url:voiceUrl}];const r=await airtableRequest('POST',AVATAR_TABLE,{fields,typecast:true});return normalizeAvatar(r);}
async function updateAvatar(recordId,updates){const r=await airtableRequest('PATCH',`${AVATAR_TABLE}/${recordId}`,{fields:updates,typecast:true});return normalizeAvatar(r);}
function normalizeAvatar(record){const f=record.fields||{};const ia=f['Avatar Image'];const va=f['Voice Sample'];return{id:record.id,name:f.Name||'Unknown',image_url:ia&&ia[0]?ia[0].url:null,voice_url:va&&va[0]?va[0].url:null,created:record.createdTime};}

/**
 * Find a voice fallback for an avatar that has no Voice Sample.
 * Looks for another avatar of the same character (e.g. "Bianca", "Larry", "Malik")
 * that DOES have a voice sample, and returns that voice_url.
 * Character name is extracted from the first word of the avatar name
 * (e.g. "Solo Malik 13" → character "Malik").
 * @param {string} avatarName - name of the voiceless avatar
 * @returns {Promise<string|null>} voice_url from a sibling, or null
 */
async function getCharacterVoiceFallback(avatarName) {
  try {
    // Extract character name: try known characters first, then fall back to first word
    const knownCharacters = ['bianca', 'larry', 'malik'];
    const nameLower = avatarName.toLowerCase();
    let character = knownCharacters.find(c => nameLower.includes(c));
    if (!character) {
      // Fallback: first word of the name
      character = avatarName.split(/\s+/)[0];
    }

    logger.info(`[Airtable] Looking for voice fallback for "${avatarName}" (character: ${character})`);

    const allAvatars = await getAvatars();
    const siblings = allAvatars
      .filter(r => {
        const name = (r.fields?.Name || '').toLowerCase();
        return name.includes(character.toLowerCase());
      })
      .map(normalizeAvatar)
      .filter(a => a.voice_url && a.name !== avatarName);

    if (siblings.length) {
      const pick = siblings[Math.floor(Math.random() * siblings.length)];
      logger.info(`[Airtable] Voice fallback: using "${pick.name}" voice for "${avatarName}"`);
      return pick.voice_url;
    }

    logger.warn(`[Airtable] No voice fallback found for character "${character}"`);
    return null;
  } catch (e) {
    logger.warn(`[Airtable] Voice fallback lookup failed: ${e.message}`);
    return null;
  }
}

module.exports={createContentRecord,updateContentRecord,getContentRecord,searchContentRecords,isDuplicate,getPendingRecords,getAvatars,getRandomAvatar,getAvatarByName,createAvatar,updateAvatar,normalizeAvatar,getCharacterVoiceFallback};
