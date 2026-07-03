// cloud_db.js - 统一的 Supabase 云端数据模块
// 所有页面通过这个模块读写云端数据

var SUPABASE_URL = 'https://eivqbbxyllsorbvgqsju.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpdnFiYnh5bGxzb3Jidmdxc2p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MTIzMDksImV4cCI6MjA5ODI4ODMwOX0.QeKnbo1cgA0yGMOEydML3PNXatH1V1QXfW0hyxRy7KY';
var ROW_ID = 'init';

function cloudReq(method, path, body) {
  return new Promise(function(resolve, reject) {
    var xhr = new XMLHttpRequest();
    xhr.open(method, SUPABASE_URL + '/rest/v1/' + path, true);
    xhr.setRequestHeader('apikey', SUPABASE_KEY);
    xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_KEY);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Prefer', 'return=representation');
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } 
          catch(e) { resolve(xhr.responseText); }
        } else {
          reject({ status: xhr.status, msg: xhr.responseText });
        }
      }
    };
    xhr.onerror = function() { reject({ status: -1, msg: '网络错误' }); };
    if (body) xhr.send(JSON.stringify(body));
    else xhr.send();
  });
}

// 加载云端全部数据
function cloudLoad() {
  return cloudReq('GET', 'village_data?id=eq.' + ROW_ID + '&select=data');
}

// 保存全部数据（完整替换）
function cloudSave(allData) {
  return cloudReq('PATCH', 'village_data?id=eq.' + ROW_ID, { data: allData });
}

// 获取所有注册申请
function cloudGetRegistrations() {
  return cloudLoad().then(function(rows) {
    if (rows && rows.length > 0 && rows[0].data && rows[0].data.registrations) {
      return rows[0].data.registrations;
    }
    return [];
  });
}

// 添加一条注册申请
function cloudAddRegistration(reg) {
  return cloudLoad().then(function(rows) {
    var allData = { food:[],camps:[],accounts:[],messages:[],products:[],villages:[],announcements:[],registrations:[] };
    if (rows && rows.length > 0) allData = Object.assign(allData, rows[0].data);
    if (!allData.registrations) allData.registrations = [];
    allData.registrations.push(reg);
    return cloudSave(allData);
  });
}

// 更新一条注册申请的状态
function cloudUpdateRegistration(regId, updates) {
  return cloudLoad().then(function(rows) {
    var allData = { food:[],camps:[],accounts:[],messages:[],products:[],villages:[],announcements:[],registrations:[] };
    if (rows && rows.length > 0) allData = Object.assign(allData, rows[0].data);
    if (!allData.registrations) allData.registrations = [];
    allData.registrations = allData.registrations.map(function(r) {
      if (r.id === regId) return Object.assign({}, r, updates);
      return r;
    });
    return cloudSave(allData);
  });
}

// 将注册申请转为正式账号
function cloudApproveRegistration(regId) {
  return cloudLoad().then(function(rows) {
    var allData = { food:[],camps:[],accounts:[],messages:[],products:[],villages:[],announcements:[],registrations:[] };
    if (rows && rows.length > 0) allData = Object.assign(allData, rows[0].data);
    if (!allData.registrations) return Promise.reject('no registrations');
    
    var reg = allData.registrations.find(function(r) { return r.id === regId; });
    if (!reg) return Promise.reject('not found');
    
    // 更新状态
    allData.registrations = allData.registrations.map(function(r) {
      if (r.id === regId) return Object.assign({}, r, { status: '已通过', approvedAt: Date.now() });
      return r;
    });
    
    // 根据角色类型写入对应集合
    var role = reg.role || '';
    if (role.indexOf('村主任') >= 0 || role.indexOf('村长') >= 0) {
      // 写入 villages
      if (!allData.villages) allData.villages = [];
      var exists = allData.villages.some(function(v) { return v.name === reg.villageName; });
      if (!exists) {
        allData.villages.push({
          id: 'v' + Date.now(),
          name: reg.villageName || reg.village || '新村庄',
          city: reg.city || '',
          province: reg.province || '',
          chief: { name: reg.name || '', phone: reg.phone || '' },
          description: reg.description || '',
          images: reg.images || [],
          status: '已认证',
          createdAt: Date.now()
        });
      }
    } else if (role.indexOf('游客') >= 0) {
      // 游客直接通过
    } else {
      // 其他角色写入 accounts
      if (!allData.accounts) allData.accounts = [];
      var existsAcc = allData.accounts.some(function(a) { return a.phone === reg.phone; });
      if (!existsAcc) {
        allData.accounts.push({
          id: 'u' + Date.now(),
          name: reg.name || '',
          phone: reg.phone || '',
          role: reg.role || '',
          status: '已通过',
          createdAt: Date.now()
        });
      }
    }
    
    return cloudSave(allData);
  });
}

// 删除一条注册申请
function cloudRejectRegistration(regId) {
  return cloudUpdateRegistration(regId, { status: '已拒绝' });
}

// 获取村庄列表
function cloudGetVillages() {
  return cloudLoad().then(function(rows) {
    if (rows && rows.length > 0 && rows[0].data && rows[0].data.villages) {
      return rows[0].data.villages;
    }
    return [];
  });
}

// 写一行测试数据（初始化用）
function cloudInit() {
  return cloudReq('GET', 'village_data?id=eq.' + ROW_ID + '&select=id').then(function(rows) {
    if (rows && rows.length > 0) return rows;
    return cloudReq('POST', 'village_data', { id: ROW_ID, data: { food:[],camps:[],accounts:[],messages:[],products:[],villages:[],announcements:[],registrations:[] } });
  });
}
