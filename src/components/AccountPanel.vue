<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { bridge } from '../lib/bridge.js'
import { showToast } from '../lib/toast.js'

const emit = defineEmits(['close'])

const alist = ref({ base_url: 'http://127.0.0.1:5244', username: 'admin', password: '' })
const alistStatus = ref(null)
const ppPath = ref('')
const accounts = ref([])
const supported = ref([])

const adding = ref(false)
const selProvider = ref('quark')
const method = ref('paste') // paste | qr
const pasteVals = ref({})
const qr = ref(null) // {qr, poll, note}
const qrState = ref('') // idle | waiting | done | error
let qrTimer = null

async function load() {
  try {
    const r = await bridge.listAccounts()
    accounts.value = r.accounts || []
    supported.value = r.supported || []
  } catch (e) {
    showToast('无法连接本地桥接服务（bridge 未启动？）')
  }
}

async function saveAList() {
  try {
    const r = await bridge.configureAList({ ...alist.value, base_url: alist.value.base_url.trim() })
    alistStatus.value = r
    if (r.token_ok) showToast('AList 连接成功')
    else showToast('已保存，但登录失败：' + (r.login_error || '请检查账号'))
  } catch (e) {
    showToast('AList 配置失败：' + e.message)
  }
}

async function savePP() {
  try {
    await bridge.setPotplayerPath(ppPath.value.trim())
    showToast('PotPlayer 路径已保存')
  } catch (e) {
    showToast('保存失败：' + e.message)
  }
}

async function refreshStatus() {
  try {
    alistStatus.value = await bridge.status()
  } catch (e) {
    alistStatus.value = { configured: false, token_ok: false }
  }
}

function openAdd() {
  adding.value = true
  method.value = 'paste'
  qr.value = null
  pasteVals.value = {}
  selProvider.value = supported.value[0]?.id || 'quark'
}

function pickProvider(p) {
  selProvider.value = p
  pasteVals.value = {}
  qr.value = null
}

async function startQR() {
  qrState.value = 'waiting'
  qr.value = null
  try {
    const r = await bridge.qrStart(selProvider.value)
    if (r.qr || r.note) {
      qr.value = r
      pollQR()
    } else {
      qrState.value = 'error'
    }
  } catch (e) {
    qrState.value = 'error'
    showToast('二维码获取失败：' + e.message)
  }
}

function pollQR() {
  clearInterval(qrTimer)
  qrTimer = setInterval(async () => {
    try {
      const r = await bridge.qrPoll(selProvider.value, qr.value.poll)
      if (r.pending) return
      clearInterval(qrTimer)
      qrState.value = 'done'
      showToast('登录成功：' + (r.account?.name || selProvider.value))
      adding.value = false
      load()
    } catch (e) {
      clearInterval(qrTimer)
      qrState.value = 'error'
      showToast('登录轮询失败：' + e.message)
    }
  }, 2500)
}

async function savePaste() {
  try {
    await bridge.addAccount({
      provider: selProvider.value,
      name: supported.value.find((s) => s.id === selProvider.value)?.name,
      creds: { ...pasteVals.value },
    })
    showToast('凭据已保存')
    adding.value = false
    load()
  } catch (e) {
    showToast('保存失败：' + e.message)
  }
}

async function removeAccount(provider) {
  try {
    await bridge.removeAccount(provider)
    showToast('已移除')
    load()
  } catch (e) {
    showToast('移除失败：' + e.message)
  }
}

function qrIsImage() {
  return qr.value?.qr?.startsWith('data:image')
}
function qrIsUrl() {
  return /^https?:\/\//.test(qr.value?.qr || '')
}

onMounted(() => {
  load()
  refreshStatus()
  bridge.potplayerPath().then((r) => (ppPath.value = r.path || '')).catch(() => {})
})
onBeforeUnmount(() => clearInterval(qrTimer))
</script>

<template>
  <div class="modal-scrim" @click.self="emit('close')">
    <div class="modal acc">
      <div class="mhead">
        <h3>网盘账号与播放</h3>
        <button class="x" @click="emit('close')">✕</button>
      </div>

      <!-- AList -->
      <section class="blk">
        <div class="blk-h">
          <span>AList（本地网盘聚合）</span>
          <span v-if="alistStatus" class="tag" :class="alistStatus.token_ok ? 'ok' : 'bad'">
            {{ alistStatus.token_ok ? '已连接' : (alistStatus.configured ? '未登录' : '未配置') }}
          </span>
        </div>
        <div class="grid2">
          <label class="lbl">AList 地址</label>
          <input class="inp" v-model="alist.base_url" placeholder="http://127.0.0.1:5244" spellcheck="false" />
          <label class="lbl">管理员账号</label>
          <input class="inp" v-model="alist.username" placeholder="admin" spellcheck="false" />
          <label class="lbl">管理员密码</label>
          <input class="inp" v-model="alist.password" type="password" placeholder="AList 密码" spellcheck="false" />
        </div>
        <button class="save sm" @click="saveAList">保存并登录</button>
      </section>

      <!-- PotPlayer -->
      <section class="blk">
        <div class="blk-h"><span>PotPlayer 路径</span></div>
        <div class="grid2">
          <label class="lbl">可执行文件</label>
          <input class="inp" v-model="ppPath" placeholder="C:\Program Files\PotPlayer\PotPlayerMini64.exe" spellcheck="false" />
        </div>
        <button class="save sm" @click="savePP">保存</button>
      </section>

      <!-- 网盘账号 -->
      <section class="blk">
        <div class="blk-h">
          <span>网盘账号</span>
          <button class="add" @click="openAdd">+ 添加</button>
        </div>

        <div v-if="!accounts.length" class="empty">尚未登录任何网盘。添加后，播放按钮将直接调用 AList + PotPlayer。</div>
        <ul v-else class="acclist">
          <li v-for="a in accounts" :key="a.id">
            <span class="adot" :class="a.provider"></span>
            <span class="an">{{ a.name }}</span>
            <span class="ap">{{ a.provider }}</span>
            <button class="del" @click="removeAccount(a.provider)">移除</button>
          </li>
        </ul>

        <!-- 添加表单 -->
        <div v-if="adding" class="addform">
          <div class="prov">
            <button
              v-for="s in supported"
              :key="s.id"
              class="pbtn"
              :class="{ on: selProvider === s.id }"
              @click="pickProvider(s.id)"
            >
              {{ s.name }}
            </button>
          </div>

          <div class="mtabs">
            <button class="mt" :class="{ on: method === 'paste' }" @click="(method = 'paste'), (qr.value = null)">粘贴凭据</button>
            <button class="mt" :class="{ on: method === 'qr' }" @click="(method = 'qr'), startQR()" :disabled="!supported.find(s=>s.id===selProvider)?.supports_qr">二维码</button>
          </div>

          <!-- 粘贴 -->
          <div v-if="method === 'paste'" class="pastebox">
            <div v-for="f in (supported.find(s=>s.id===selProvider)?.paste_fields || [])" :key="f.key" class="pf">
              <label class="lbl">{{ f.label }}</label>
              <input class="inp" v-model="pasteVals[f.key]" :type="f.secret ? 'password' : 'text'" :placeholder="f.placeholder" spellcheck="false" />
            </div>
            <button class="save" @click="savePaste">保存凭据</button>
          </div>

          <!-- 二维码 -->
          <div v-else class="qrbox">
            <div v-if="qrIsImage()" class="qrimg"><img :src="qr.qr" alt="qr" /></div>
            <div v-else-if="qrIsUrl()" class="qrlink">
              <p>请用{{ supported.find(s=>s.id===selProvider)?.name }}APP 扫码：</p>
              <a :href="qr.qr" target="_blank" rel="noopener">{{ qr.qr }}</a>
              <p v-if="qr.note" class="note">{{ qr.note }}</p>
            </div>
            <div v-else class="qrimg"><pre class="qrtxt">{{ qr.qr }}</pre></div>
            <p class="qrstat" v-if="qrState==='waiting'">等待扫码…（自动轮询中）</p>
            <p class="qrstat err" v-else-if="qrState==='error'">二维码登录暂不可用，请改用「粘贴凭据」</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.modal.acc {
  width: min(520px, 100%);
  max-height: 86vh;
  overflow-y: auto;
}
.mhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.mhead h3 {
  margin: 0;
  font-size: 18px;
}
.x {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--bg-3);
  color: var(--text-3);
  font-size: 14px;
}
.blk {
  border-top: 1px solid var(--border);
  padding: 16px 0;
}
.blk:first-of-type {
  border-top: none;
  padding-top: 4px;
}
.blk-h {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 12px;
}
.tag {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 9px;
  border-radius: 99px;
}
.tag.ok {
  background: rgba(34, 197, 94, 0.18);
  color: #86efac;
}
.tag.bad {
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
}
.grid2 {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 9px 10px;
  align-items: center;
  margin-bottom: 12px;
}
.lbl {
  font-size: 12.5px;
  color: var(--text-3);
}
.inp {
  width: 100%;
  height: 38px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  color: var(--text-1);
  font-size: 13px;
  outline: none;
}
.inp:focus {
  border-color: rgba(59, 130, 246, 0.5);
}
.save {
  padding: 9px 20px;
  border-radius: 10px;
  background: var(--accent-grad);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
}
.save.sm {
  padding: 7px 16px;
  font-size: 13px;
}
.add {
  padding: 6px 14px;
  border-radius: 99px;
  background: var(--bg-3);
  color: var(--text-1);
  font-size: 13px;
  border: 1px solid var(--border);
}
.empty {
  font-size: 13px;
  color: var(--text-3);
  line-height: 1.6;
}
.acclist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.acclist li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-1);
  border: 1px solid var(--border);
}
.adot {
  width: 9px;
  height: 9px;
  border-radius: 99px;
  background: var(--accent);
}
.adot.quark { background: #4f7cff; }
.adot.aliyun { background: #ff6a00; }
.an { font-size: 14px; font-weight: 600; }
.ap { font-size: 12px; color: var(--text-3); }
.del {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-3);
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
}
.del:hover { color: var(--danger); border-color: rgba(239, 68, 68, 0.4); }

.addform {
  margin-top: 14px;
  padding: 14px;
  border-radius: 12px;
  background: var(--bg-1);
  border: 1px solid var(--border);
}
.prov {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.pbtn {
  padding: 7px 14px;
  border-radius: 99px;
  background: var(--bg-3);
  border: 1px solid var(--border);
  color: var(--text-2);
  font-size: 13px;
}
.pbtn.on {
  background: rgba(59, 130, 246, 0.16);
  border-color: rgba(59, 130, 246, 0.5);
  color: #cfe0ff;
}
.mtabs {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
}
.mt {
  padding: 6px 14px;
  border-radius: 8px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  color: var(--text-3);
  font-size: 13px;
}
.mt.on { color: var(--text-1); border-color: var(--border-strong); }
.mt:disabled { opacity: 0.4; cursor: not-allowed; }
.pastebox .pf { margin-bottom: 10px; }
.qrbox { text-align: center; }
.qrimg { display: flex; justify-content: center; }
.qrbox img { width: 200px; height: 200px; border-radius: 10px; background: #fff; padding: 8px; }
.qrtxt {
  display: inline-block;
  background: #fff;
  color: #000;
  padding: 12px;
  border-radius: 8px;
  font-size: 12px;
  word-break: break-all;
  max-width: 100%;
  white-space: pre-wrap;
}
.qrlink a { color: var(--accent); word-break: break-all; font-size: 12.5px; }
.note { font-size: 12px; color: var(--text-3); margin-top: 8px; }
.qrstat { font-size: 13px; color: var(--text-3); margin-top: 10px; }
.qrstat.err { color: var(--danger); }
</style>
