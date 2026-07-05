// cloud_db.js - 统一的 Supabase 云端数据模块
// 包含：registrations + accounts 两套数据同步
var SUPABASE_URL = 'https://eivqbbxyllsorbvgqsju.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpdnFiYnh5bGxzb3Jidmdxc2p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MTIzMDksImV4cCI6MjA5ODI4ODMwOX0.QeKnbo1cgA0yGMOEydML3PNXatH1V1QXfW0hyxRy7KY';
var ROW_ID = 'init';

// 兼容旧 API
var CloudDB = {
  loadFromPublic: function() { return cloudLoad(); },
  addRegistration: cloudAddRegistration,
  updateRegistration: cloudUpdateRegistration,
  approveRegistration: cloudApproveRegistration,
  saveAll: cloudSave,
  loadAll: cloudLoad
};

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

// 获取云端账号列表（返回 accounts 数组）
function cloudGetAllAccounts() {
  return cloudLoad().then(function(rows) {
    var allData = { accounts: [] };
    if (rows && rows.length > 0 && rows[0].data) {
      allData = rows[0].data;
    }
    return allData.accounts || [];
  });
}

// 添加一个正式账号（审核通过时调用）
function cloudAddAccount(accountInfo) {
  return cloudLoad().then(function(rows) {
    var allData = { food:[],camps:[],accounts:[],messages:[],products:[],villages:[],announcements:[],registrations:[] };
    if (rows && rows.length > 0) {
      allData = Object.assign(allData, rows[0].data);
    }
    if (!allData.accounts) allData.accounts = [];
    // 检查是否已存在（按手机号去重）
    var exists = false;
    for (var i = 0; i < allData.accounts.length; i++) {
      if (allData.accounts[i].phone === accountInfo.phone) {
        // 已存在则更新角色
        allData.accounts[i].role = accountInfo.role || allData.accounts[i].role;
        allData.accounts[i].currentRole = accountInfo.currentRole || accountInfo.role || allData.accounts[i].currentRole;
        allData.accounts[i].nickName = accountInfo.nickName || allData.accounts[i].nickName;
        allData.accounts[i].village = accountInfo.village || allData.accounts[i].village;
        exists = true;
        break;
      }
    }
    if (!exists) {
      allData.accounts.push(accountInfo);
    }
    return cloudSave(allData);
  });
}

// 获取所有注册申请
function cloudGetAllRegistrations() {
  return cloudLoad().then(function(rows) {
    var allData = { registrations: [] };
    if (rows && rows.length > 0 && rows[0].data) {
      allData = rows[0].data;
    }
    return allData.registrations || [];
  });
}

// 添加一条注册申请
function cloudAddRegistration(reg) {
  return cloudLoad().then(function(rows) {
    var allData = { food:[],camps:[],accounts:[],messages:[],products:[],villages:[],announcements:[],registrations:[] };
    if (rows && rows.length > 0) {
      allData = Object.assign(allData, rows[0].data);
    }
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

// 审核通过：更新申请状态 + 创建正式账号（两件事一起做）
function cloudApproveRegistration(regId, callback) {
  cloudLoad().then(function(rows) {
    var allData = { food:[],camps:[],accounts:[],messages:[],products:[],villages:[],announcements:[],registrations:[] };
    if (rows && rows.length > 0) allData = Object.assign(allData, rows[0].data);
    if (!allData.registrations) allData.registrations = [];
    if (!allData.accounts) allData.accounts = [];

    var targetReg = null;
    for (var i = 0; i < allData.registrations.length; i++) {
      if (allData.registrations[i].id === regId) {
        allData.registrations[i].status = '已通过';
        targetReg = allData.registrations[i];
        break;
      }
    }

    // 关键：如果该手机号还没有账号，则创建正式账号
    if (targetReg && targetReg.phone) {
      var phone = targetReg.phone;
      var accountExists = false;
      for (var j = 0; j < allData.accounts.length; j++) {
        if (allData.accounts[j].phone === phone) {
          // 已有账号，只更新角色
          allData.accounts[j].role = targetReg.role || targetReg.type || allData.accounts[j].role;
          allData.accounts[j].currentRole = targetReg.role || targetReg.type || allData.accounts[j].currentRole;
          allData.accounts[j].nickName = targetReg.name || allData.accounts[j].nickName;
          allData.accounts[j].village = targetReg.village || allData.accounts[j].village;
          accountExists = true;
          break;
        }
      }
      if (!accountExists) {
        // 没有账号，创建新正式账号（可登录）
        // 密码默认设为手机号后6位，用户可在个人中心修改
        var defaultPwd = phone.length >= 6 ? phone.slice(-6) : '123456';
        var newAccount = {
          id: 'acc_' + Date.now(),
          account: phone,
          phone: phone,
          nickName: targetReg.name || phone,
          role: targetReg.role || targetReg.type || '普通用户',
          currentRole: targetReg.role || targetReg.type || '普通用户',
          village: targetReg.village || '',
          password: defaultPwd,
          createTime: Date.now(),
          status: 'active'
        };
        allData.accounts.push(newAccount);
        console.log('[cloudApprove] 创建新账号:', newAccount.account, '角色:', newAccount.role);
      }
    }

    // 村主任还需要加入村庄列表
    if (targetReg && (targetReg.role === '村主任' || targetReg.type === '村主任')) {
      if (!allData.villages) allData.villages = [];
      var villageExists = false;
      for (var v = 0; v < allData.villages.length; v++) {
        if (allData.villages[v].name === targetReg.village) { villageExists = true; break; }
      }
      if (!villageExists && targetReg.village) {
        allData.villages.push({
          id: targetReg.id,
          name: targetReg.village,
          chiefName: targetReg.name,
          phone: targetReg.phone,
          status: '已通过'
        });
      }
    }

    return cloudSave(allData);
  }).then(function() {
    if (callback) callback(true);
  }).catch(function(err) {
    console.error('[cloudApprove] 失败:', err);
    if (callback) callback(false);
  });


// ===== 公告相关云端接口 =====

// 获取全部公告（按时间倒序）
function cloudGetNotice() {
  return cloudLoad().then(function(rows) {
    var allData = { notices: [] };
    if (rows && rows.length > 0 && rows[0].data) {
      allData = rows[0].data;
    }
    var notices = allData.notices || [];
    notices.sort(function(a, b) { return (b.createTime || 0) - (a.createTime || 0); });
    return notices;
  });
}

// 保存公告列表（完整替换）
function cloudSaveNotice(list) {
  return cloudLoad().then(function(rows) {
    var allData = { food:[],camps:[],accounts:[],messages:[],products:[],villages:[],announcements:[],registrations:[],notices:[] };
    if (rows && rows.length > 0) {
      allData = Object.assign(allData, rows[0].data);
    }
    allData.notices = list || [];
    return cloudSave(allData);
  });
}

// ===== 技师列表云端接口 =====

// 获取已通过展示的技师列表
function cloudGetTechnicianList() {
  return cloudLoad().then(function(rows) {
    var allData = { technician_list: [] };
    if (rows && rows.length > 0 && rows[0].data) allData = rows[0].data;
    return allData.technician_list || [];
  });
}

// 保存技师申请列表（审核用）
function cloudSaveTechnicianApplications(list) {
  return cloudLoad().then(function(rows) {
    var allData = { food:[],camps:[],accounts:[],messages:[],products:[],villages:[],announcements:[],registrations:[],notices:[],technician_list:[],technician_applications:[] };
    if (rows && rows.length > 0) allData = Object.assign(allData, rows[0].data);
    allData.technician_applications = list || [];
    return cloudSave(allData);
  });
}

// 保存已通过展示的技师列表（编辑后直接调用）
function cloudSaveTechnicianList(list) {
  return cloudLoad().then(function(rows) {
    var allData = { food:[],camps:[],accounts:[],messages:[],products:[],villages:[],announcements:[],registrations:[],notices:[],technician_applications:[],technician_list:[] };
    if (rows && rows.length > 0) allData = Object.assign(allData, rows[0].data);
    allData.technician_list = list || [];
    return cloudSave(allData);
  });
}

// 审核通过：技师申请 -> 写入technician_list
function cloudApproveTechnician(id) {
  return cloudLoad().then(function(rows) {
    var allData = { food:[],camps:[],accounts:[],messages:[],products:[],villages:[],announcements:[],registrations:[],notices:[],technician_applications:[],technician_list:[] };
    if (rows && rows.length > 0) allData = Object.assign(allData, rows[0].data);
    var apps = allData.technician_applications || [];
    var appItem = null;
    for (var i = 0; i < apps.length; i++) {
      if (apps[i].id == id) { appItem = apps[i]; break; }
    }
    if (!appItem) return Promise.reject({ msg: '未找到该申请' });
    appItem.status = '已通过';
    // 加入展示列表（去重：按phone）
    var list = allData.technician_list || [];
    var exist = false;
    for (var j = 0; j < list.length; j++) {
      if (list[j].phone === appItem.phone) { list[j] = appItem; exist = true; break; }
    }
    if (!exist) list.push(appItem);
    allData.technician_applications = apps;
    allData.technician_list = list;
    return cloudSave(allData);
  });
}
}
