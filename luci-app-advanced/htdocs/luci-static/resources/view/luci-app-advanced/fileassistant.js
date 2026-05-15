'use strict';
'require view';
'require fs';
'require ui';
'require uci';

// ========== 内联工具函数（原 common.js） ==========

var FS_ERROR_MAP = {
	'ENOENT':    _('文件或目录不存在'),
	'EACCES':    _('权限不足，请检查 ACL 配置'),
	'ENOSPC':    _('磁盘空间不足'),
	'ETIMEOUT':  _('连接超时，请检查 rpcd 服务状态'),
	'EISDIR':    _('目标是目录，需要文件'),
	'ENOTDIR':   _('目标是文件，需要目录'),
	'ENOTEMPTY': _('目录不为空')
};

var _capabilitiesCache = null;
var _feedbackBanner = null;
var _feedbackTimer = null;
var _pendingMessages = [];

function getFeedbackBanner() {
	if (!_feedbackBanner) {
		_feedbackBanner = document.getElementById('feedback-banner');
	}
	return _feedbackBanner;
}

function handleFsError(err, operation, target) {
	var errCode = err.code || (err.message ? err.message.split(':')[0] : 'UNKNOWN');
	var userMsg = FS_ERROR_MAP[errCode] || _('未知错误') + '：' + (err.message || err);

	logOperation(operation, target, '失败: ' + userMsg);

	showFeedbackBanner({
		type: 'error',
		message: operation + _('失败') + '：' + userMsg,
		detail: err.message || err.stderr || ''
	});

	return { success: false, operation: operation, error: userMsg };
}

function showFeedbackBanner(opts) {
	var banner = getFeedbackBanner();

	if (!banner) {
		_pendingMessages.push(opts);
		return;
	}

	if (_feedbackTimer) {
		clearTimeout(_feedbackTimer);
		_feedbackTimer = null;
	}

	var colorClass = (opts.type === 'error') ? 'cbi-section-error' : 'cbi-section-success';
	banner.className = 'feedback-banner ' + colorClass;

	var text = opts.message || '';
	if (opts.detail) {
		text += ' (' + opts.detail + ')';
	}
	banner.textContent = text;
	banner.style.display = 'block';

	if (opts.type !== 'error') {
		_feedbackTimer = setTimeout(function() {
			banner.style.display = 'none';
		}, 5000);
	}
}

function showModal(type, options) {
	var modal = E('div', { 'class': 'modal-overlay' });
	var dialog = E('div', { 'class': 'modal-dialog' });

	var title = E('h3', { 'class': 'modal-title' }, [options.title]);
	var body = E('div', { 'class': 'modal-body' });

	if (options.message) {
		body.appendChild(E('p', {}, [options.message]));
	}

	var inputEl = null;
	if (type === 'input') {
		inputEl = E('input', {
			'class': 'modal-input',
			'type': 'text',
			'value': options.defaultValue || '',
			'placeholder': options.placeholder || ''
		});
		body.appendChild(inputEl);
	}

	var buttons = E('div', { 'class': 'modal-buttons' });
	var confirmBtn = E('button', {
		'class': 'cbi-button cbi-button-apply',
		'click': function() {
			var value = inputEl ? inputEl.value.trim() : true;
			if (options.onConfirm) options.onConfirm(value);
			closeModal();
		}
	}, [type === 'input' ? _('确定') : _('确认')]);

	var cancelBtn = E('button', {
		'class': 'cbi-button cbi-button-reset',
		'click': function() {
			if (options.onCancel) options.onCancel();
			closeModal();
		}
	}, [_('取消')]);

	buttons.appendChild(confirmBtn);
	buttons.appendChild(cancelBtn);
	dialog.appendChild(title);
	dialog.appendChild(body);
	dialog.appendChild(buttons);
	modal.appendChild(dialog);
	document.body.appendChild(modal);

	if (type === 'input' && inputEl) {
		inputEl.addEventListener('input', function() {
			confirmBtn.disabled = (inputEl.value.trim() === '');
		});
		confirmBtn.disabled = true;
		inputEl.focus();
	}

	var escHandler, enterHandler;

	escHandler = function(e) {
		if (e.key === 'Escape') {
			closeModal();
		}
	};

	enterHandler = function(e) {
		if (e.key === 'Enter' && !confirmBtn.disabled) {
			confirmBtn.click();
		}
	};

	document.addEventListener('keydown', escHandler);
	document.addEventListener('keydown', enterHandler);

	function closeModal() {
		document.removeEventListener('keydown', escHandler);
		document.removeEventListener('keydown', enterHandler);
		if (modal.parentNode) {
			document.body.removeChild(modal);
		}
	}

	modal.addEventListener('click', function(e) {
		if (e.target === modal) closeModal();
	});

	return { modal: modal, close: closeModal };
}

function checkCapabilities() {
	if (_capabilitiesCache) {
		return Promise.resolve(_capabilitiesCache);
	}

	return Promise.all([
		fs.exec('which', ['apk']).then(function(r) { return r.code === 0; }).catch(function() { return false; }),
		fs.exec('which', ['logger']).then(function(r) { return r.code === 0; }).catch(function() { return false; })
	]).then(function(results) {
		_capabilitiesCache = {
			apkAvailable: results[0],
			loggerAvailable: results[1]
		};
		return _capabilitiesCache;
	});
}

function logOperation(type, target, result) {
	checkCapabilities().then(function(caps) {
		if (!caps.loggerAvailable) return;
		var msg = '[' + type + '] [' + target + '] [' + result + ']';
		fs.exec('logger', ['-t', 'luci-advanced', msg]).catch(function() {});
	});
}

function normalizeNewlines(str) {
	if (typeof str !== 'string') return str;
	return str.replace(/\r\n/g, '\n');
}

function escapeHtml(str) {
	if (typeof str !== 'string') return str;
	var div = document.createElement('div');
	div.appendChild(document.createTextNode(str));
	return div.innerHTML;
}

// ========== MIME 类型映射 ==========
var MIME_TYPES = {
	txt: 'text/plain', conf: 'text/plain', ovpn: 'text/plain',
	log: 'text/plain', js: 'text/javascript', json: 'application/json',
	css: 'text/css', htm: 'text/html', html: 'text/html',
	patch: 'text/x-patch', c: 'text/x-csrc', h: 'text/x-chdr',
	o: 'text/x-object', ko: 'text/x-object',
	bmp: 'image/bmp', gif: 'image/gif', png: 'image/png',
	jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml',
	zip: 'application/zip', pdf: 'application/pdf', xml: 'application/xml',
	xsl: 'application/xml', doc: 'application/msword',
	ppt: 'application/vnd.ms-powerpoint', xls: 'application/vnd.ms-excel',
	odt: 'application/vnd.oasis.opendocument.text',
	odp: 'application/vnd.oasis.opendocument.presentation',
	pl: 'application/x-perl', sh: 'application/x-shellscript',
	php: 'application/x-php', deb: 'application/x-deb',
	iso: 'application/x-cd-image', tgz: 'application/x-compressed-tar',
	mp3: 'audio/mpeg', ogg: 'audio/x-vorbis+ogg',
	wav: 'audio/x-wav', mpg: 'video/mpeg',
	mpeg: 'video/mpeg', avi: 'video/x-msvideo'
};

// ========== 系统关键目录 ==========
var SYSTEM_CRITICAL_DIRS = ['/', '/bin', '/sbin', '/lib', '/usr', '/etc', '/overlay'];

// ========== 文件管理器工具函数 ==========
function getFileIcon(entry) {
	if (entry.type === 'directory') return '📁';
	if (entry.type === 'symlink') return '🔗';
	return '📄';
}

function getMimeType(filename) {
	var ext = filename.split('.').pop();
	if (ext && MIME_TYPES[ext.toLowerCase()]) {
		return MIME_TYPES[ext.toLowerCase()];
	}
	return 'application/octet-stream';
}

function formatSize(bytes) {
	if (typeof bytes !== 'number') return '-';
	if (bytes < 1024) return bytes + ' B';
	if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
	if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDate(timestamp) {
	if (!timestamp) return '-';
	var d = new Date(timestamp * 1000);
	var pad = function(n) { return n < 10 ? '0' + n : n; };
	return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
		' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function formatPerms(mode) {
	if (typeof mode !== 'number') return '----------';
	var perms = '';
	var chars = ['r', 'w', 'x'];
	for (var i = 6; i >= 0; i--) {
		perms += (mode & (1 << i)) ? chars[i % 3] : '-';
	}
	var prefix = '-';
	if (mode & 0o040000) prefix = 'd';
	if (mode & 0o120000) prefix = 'l';
	return prefix + perms;
}

function concatPath(base, name) {
	if (base === '/') return '/' + name;
	return base.replace(/\/$/, '') + '/' + name;
}

function getParentPath(path) {
	if (path === '/') return '/';
	var parts = path.replace(/\/$/, '').split('/');
	parts.pop();
	return parts.join('/') || '/';
}

function isPreviewableMime(mime) {
	if (mime.startsWith('text/')) return true;
	if (mime === 'application/json' || mime === 'application/javascript' ||
	    mime === 'application/xml' || mime === 'application/x-perl' ||
	    mime === 'application/x-shellscript' || mime === 'application/x-php') return true;
	if (mime.startsWith('image/')) return true;
	if (mime === 'application/pdf') return true;
	if (mime.startsWith('audio/') || mime.startsWith('video/')) return true;
	if (mime === 'image/svg+xml') return true;
	return false;
}

function buildPreviewHtml(fileName, mime, blobUrl) {
	var html = '<!DOCTYPE html>\n<html>\n<head>\n';
	html += '<meta charset="utf-8">\n';
	html += '<title>' + escapeHtml(fileName) + '</title>\n';
	html += '<style>\n';
	html += 'body { margin: 0; padding: 16px; font-family: monospace; white-space: pre-wrap; word-wrap: break-word; }\n';
	html += 'img { max-width: 100%; height: auto; }\n';
	html += '</style>\n</head>\n<body>\n';

	if (mime.startsWith('image/') || mime === 'image/svg+xml') {
		html += '<img src="' + blobUrl + '" alt="' + escapeHtml(fileName) + '">\n';
	} else if (mime.startsWith('audio/')) {
		html += '<audio controls style="width:100%"><source src="' + blobUrl + '" type="' + mime + '"></audio>\n';
	} else if (mime.startsWith('video/')) {
		html += '<video controls style="max-width:100%"><source src="' + blobUrl + '" type="' + mime + '"></video>\n';
	} else if (mime === 'application/pdf') {
		html += '<iframe src="' + blobUrl + '" style="width:100%;height:100vh;border:none;"></iframe>\n';
	} else {
		html += '<pre id="content"></pre>\n';
	}

	html += '</body>\n</html>';
	return html;
}

function resolveSymlinkTarget(path) {
	return fs.stat(path).then(function(stat) {
		return stat.type || 'file';
	}).catch(function() {
		return 'unknown';
	});
}

function normalizePath(path) {
	return fs.stat(path).then(function(stat) {
		return path;
	}).catch(function() {
		return null;
	});
}

function isSystemCriticalDir(path) {
	var normalized = path.replace(/\/$/, '');
	for (var i = 0; i < SYSTEM_CRITICAL_DIRS.length; i++) {
		if (normalized === SYSTEM_CRITICAL_DIRS[i]) return true;
	}
	return false;
}

// ========== 用户映射缓存 ==========
var _userMap = null;

function loadUserMap() {
	if (_userMap) return Promise.resolve(_userMap);
	return fs.read('/etc/passwd').then(function(data) {
		_userMap = {};
		var lines = data.split('\n');
		for (var i = 0; i < lines.length; i++) {
			var parts = lines[i].split(':');
			if (parts.length >= 3) {
				_userMap[parts[2]] = parts[0];
			}
		}
		return _userMap;
	}).catch(function() {
		_userMap = {};
		return _userMap;
	});
}

function getUsername(uid) {
	if (_userMap && _userMap[String(uid)]) {
		return _userMap[String(uid)];
	}
	return String(uid);
}

// ========== 路径白名单 ==========
var ALLOWED_PREFIXES = ['/'];

function setAllowedPrefixes(prefixes) {
	if (Array.isArray(prefixes) && prefixes.length > 0) {
		ALLOWED_PREFIXES = prefixes;
	}
}

function isPathAllowed(path) {
	if (!path || path === '/' || path === '/*' || path === '') return false;
	for (var i = 0; i < ALLOWED_PREFIXES.length; i++) {
		if (path.indexOf(ALLOWED_PREFIXES[i]) === 0) return true;
	}
	return false;
}

function execWithTimeout(cmd, args, timeoutMs) {
	return new Promise(function(resolve, reject) {
		var timeoutId = setTimeout(function() {
			reject({ code: -1, stderr: _('操作超时') });
		}, timeoutMs);
		fs.exec(cmd, args).then(function(result) {
			clearTimeout(timeoutId);
			resolve(result);
		}).catch(function(err) {
			clearTimeout(timeoutId);
			reject(err);
		});
	});
}

// ========== 全局样式注入 ==========
var _stylesInjected = false;

function injectStyles() {
	if (_stylesInjected) return;
	if (!document.head) return;
	_stylesInjected = true;

	var css = [
		'.fileassistant-container { padding: 1rem; }',
		'.nav-row { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }',
		'.path-input { flex: 1; padding: 0.4rem; border: 1px solid #ccc; border-radius: 3px; font-family: monospace; }',
		'.toolbar { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap; }',
		'.file-table { width: 100%; border-collapse: collapse; }',
		'.file-table th { text-align: left; padding: 0.4rem; border-bottom: 2px solid #ddd; cursor: pointer; user-select: none; background: #f5f5f5; }',
		'.file-table td { padding: 0.3rem 0.4rem; border-bottom: 1px solid #eee; }',
		'.file-row { cursor: pointer; }',
		'.file-row:hover { background: #e8f0fe; }',
		'.parent-row { cursor: pointer; }',
		'.parent-row:hover { background: #e8f0fe; }',
		'.col-check { width: 2rem; text-align: center; }',
		'.col-icon { width: 2rem; text-align: center; }',
		'.col-name { word-break: break-all; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%; }',
		'.col-size { width: 6rem; white-space: nowrap; }',
		'.col-date { width: 9rem; white-space: nowrap; }',
		'.col-perms { width: 7rem; font-family: monospace; font-size: 0.8rem; }',
		'.empty-dir { text-align: center; padding: 2rem; color: #999; }',
		'.large-dir-hint { text-align: center; padding: 0.5rem; color: #856404; background: #fff3cd; font-size: 0.85rem; margin-top: 0.5rem; }',
		'.pagination { text-align: center; padding: 0.5rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; }',
		'.feedback-banner { padding: 0.6rem 1rem; margin-bottom: 0.5rem; border-radius: 3px; font-size: 0.9rem; }',
		'.cbi-section-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }',
		'.cbi-section-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }',
		'.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); z-index: 9999; display: flex; align-items: center; justify-content: center; }',
		'.modal-dialog { background: #fff; border-radius: 6px; padding: 1.5rem; min-width: 300px; max-width: 80vw; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }',
		'.modal-title { margin: 0 0 0.5rem 0; }',
		'.modal-body { margin-bottom: 1rem; }',
		'.modal-body p { margin: 0.3rem 0; }',
		'.modal-input { width: 100%; padding: 0.4rem; border: 1px solid #ccc; border-radius: 3px; font-size: 0.9rem; box-sizing: border-box; }',
		'.modal-buttons { display: flex; gap: 0.5rem; justify-content: flex-end; }',
		'.context-menu { position: fixed; z-index: 10000; background: #fff; border: 1px solid #ccc; border-radius: 4px; box-shadow: 0 2px 10px rgba(0,0,0,0.2); min-width: 150px; }',
		'.ctx-item { padding: 0.5rem 1rem; cursor: pointer; font-size: 0.9rem; }',
		'.ctx-item:hover { background: #e8f0fe; }',
		'.ctx-delete { color: #721c24; }'
	].join('\n');

	var styleEl = E('style', { 'type': 'text/css' }, [css]);
	document.head.appendChild(styleEl);
}

document.addEventListener('DOMContentLoaded', function() {
	injectStyles();
});

// ========== 主视图 ==========
return view.extend({
	_currentPath: '/',
	_requestId: 0,
	_fileList: null,
	_selectedFiles: {},
	_lastClickedIndex: -1,
	_sortColumn: 'name',
	_sortAsc: true,
	_capabilities: null,
	_uploading: false,
	_uploadQueue: [],
	_uploadActive: 0,
	_operating: false,
	_contextMenuVisible: false,
	_contextMenuPath: null,
	_contextMenuType: null,
	_inputRaf: null,
	_maxUploadSize: 10 * 1024 * 1024,
	_largeDirThreshold: 200,
	_currentPage: 0,
	_pageSize: 100,

	load: function() {
		var self = this;
		var initPath = '/';

		if (/path=([^&]+)/.test(location.search)) {
			initPath = decodeURIComponent(RegExp.$1);
		} else if (window.sessionStorage) {
			var saved = sessionStorage.getItem('luci-advanced-lastpath');
			if (saved) initPath = saved;
		}

		self._currentPath = initPath;

		return uci.load('advanced').then(function() {
			var prefixes = uci.get('advanced', 'fileassistant', 'allowed_prefixes');
			if (Array.isArray(prefixes) && prefixes.length > 0) {
				setAllowedPrefixes(prefixes);
			}
			var maxSize = uci.get('advanced', 'fileassistant', 'max_upload_size');
			if (maxSize && !isNaN(parseInt(maxSize))) {
				self._maxUploadSize = parseInt(maxSize) * 1024 * 1024;
			}
		}).catch(function() {
		}).then(function() {
			return Promise.all([
				self._navigate(initPath),
				loadUserMap(),
				checkCapabilities().then(function(caps) {
					self._capabilities = caps;
				})
			]);
		});
	},

	render: function() {
		var self = this;
		var body = E('div', { 'class': 'fileassistant-container' });

		var navRow = E('div', { 'class': 'nav-row' }, [
			E('input', {
				'class': 'path-input',
				'type': 'text',
				'id': 'fa-path-input',
				'value': self._currentPath,
				'keyup': function(ev) {
					if (ev.keyCode === 13) this.blur();
				},
				'blur': function() {
					var newPath = this.value.trim();
					if (newPath && newPath !== self._currentPath) {
						self._navigate(newPath);
					} else if (!newPath) {
						this.value = self._currentPath;
					}
				}
			}),
			E('button', {
				'class': 'cbi-button',
				'click': function() {
					var input = document.getElementById('fa-path-input');
					if (input) {
						var newPath = input.value.trim();
						if (newPath && newPath !== self._currentPath) {
							self._navigate(newPath);
						}
					}
				}
			}, [_('跳转')])
		]);
		body.appendChild(navRow);

		var toolbar = E('div', { 'class': 'toolbar', 'id': 'fa-toolbar' }, [
			E('button', {
				'class': 'cbi-button',
				'id': 'btn-mkdir',
				'click': function() { self._onMkdir(); }
			}, [_('新建文件夹')]),
			E('button', {
				'class': 'cbi-button',
				'id': 'btn-upload',
				'click': function() { self._onUpload(); }
			}, [_('上传')]),
			E('button', {
				'class': 'cbi-button cbi-button-reset',
				'id': 'btn-cancel-upload',
				'style': 'display:none;',
				'click': function() { self._cancelUpload(); }
			}, [_('取消上传')]),
			E('button', {
				'class': 'cbi-button cbi-button-remove',
				'id': 'btn-delete',
				'disabled': 'disabled',
				'click': function() { self._onDelete(); }
			}, [_('删除')]),
			E('button', {
				'class': 'cbi-button',
				'id': 'btn-rename',
				'disabled': 'disabled',
				'click': function() { self._onRename(); }
			}, [_('重命名')])
		]);

		if (self._capabilities && self._capabilities.apkAvailable) {
			toolbar.appendChild(E('button', {
				'class': 'cbi-button',
				'id': 'btn-install',
				'disabled': 'disabled',
				'style': 'display:none;',
				'click': function() { self._onInstall(); }
			}, [_('安装 apk')]));
		}

		body.appendChild(toolbar);

		var fileInput = E('input', {
			'type': 'file',
			'id': 'fa-upload-input',
			'multiple': 'multiple',
			'style': 'display:none;',
			'change': function() { self._startUpload(this.files); }
		});
		body.appendChild(fileInput);

		var listContainer = E('div', {
			'class': 'file-list-container',
			'id': 'fa-list-container'
		});
		body.appendChild(listContainer);
		self._renderFileList(listContainer);

		var ctxMenu = E('div', {
			'class': 'context-menu',
			'id': 'fa-context-menu',
			'style': 'display:none;'
		}, [
			E('div', {
				'class': 'ctx-item',
				'click': function() { self._ctxOpen(); self._hideContextMenu(); }
			}, [_('打开/预览')]),
			E('div', {
				'class': 'ctx-item ctx-delete',
				'click': function() { self._ctxDelete(); self._hideContextMenu(); }
			}, [_('删除')]),
			E('div', {
				'class': 'ctx-item',
				'id': 'ctx-rename',
				'click': function() { self._ctxRename(); self._hideContextMenu(); }
			}, [_('重命名')]),
			E('div', {
				'class': 'ctx-item',
				'id': 'ctx-install',
				'style': 'display:none;',
				'click': function() { self._ctxInstall(); self._hideContextMenu(); }
			}, [_('安装 apk')])
		]);
		body.appendChild(ctxMenu);

		var banner = E('div', {
			'class': 'feedback-banner',
			'id': 'feedback-banner',
			'style': 'display:none;'
		});
		body.appendChild(banner);

		document.addEventListener('click', function() {
			self._hideContextMenu();
		});

		window.addEventListener('popstate', function(ev) {
			var path = '/';
			if (ev.state && ev.state.path) {
				path = ev.state.path;
			} else if (/path=([^&]+)/.test(location.search)) {
				path = decodeURIComponent(RegExp.$1);
			}
			if (path !== self._currentPath) {
				self._navigate(path);
			}
		});

		return body;
	},

	// ========== 文件列表渲染 ==========

	_renderFileList: function(container) {
		var self = this;

		if (!self._fileList || self._fileList.length === 0) {
			container.innerHTML = '<div class="empty-dir">' + _('此目录为空') + '</div>';
			return;
		}

		var sorted = self._sortFileList(self._fileList);
		var totalFiles = sorted.length;
		var isLargeDir = totalFiles > self._largeDirThreshold;

		var headHtml = '<thead><tr>';
		headHtml += '<th class="col-check"><input type="checkbox" id="fa-select-all"></th>';
		headHtml += '<th class="col-icon"></th>';
		headHtml += '<th class="col-name" data-sort="name">' + _('名称') + self._sortIndicator('name') + '</th>';
		headHtml += '<th class="col-size" data-sort="size">' + _('大小') + self._sortIndicator('size') + '</th>';
		headHtml += '<th class="col-date" data-sort="date">' + _('日期') + self._sortIndicator('date') + '</th>';
		headHtml += '<th class="col-perms" data-sort="mode">' + _('权限') + self._sortIndicator('mode') + '</th>';
		headHtml += '</tr></thead>';

		var tbodyHtml = '<tbody>';

		if (self._currentPath !== '/') {
			tbodyHtml += '<tr class="parent-row" data-path="' + escapeHtml(getParentPath(self._currentPath)) + '">';
			tbodyHtml += '<td class="col-check"></td>';
			tbodyHtml += '<td class="col-icon">📂</td>';
			tbodyHtml += '<td class="col-name" colspan="4"><strong>.. ' + _('返回上级目录') + '</strong></td>';
			tbodyHtml += '</tr>';
		}

		var displayList = sorted;
		if (isLargeDir) {
			var start = self._currentPage * self._pageSize;
			var end = Math.min(start + self._pageSize, totalFiles);
			displayList = sorted.slice(start, end);
		}

		for (var i = 0; i < displayList.length; i++) {
			var entry = displayList[i];
			var fullPath = concatPath(self._currentPath, entry.name);
			var icon = getFileIcon(entry);
			var sizeStr = entry.type === 'directory' ? '-' : formatSize(entry.size);
			var dateStr = formatDate(entry.mtime);
			var permsStr = formatPerms(entry.mode);
			var ownerStr = getUsername(entry.uid);
			var checked = self._selectedFiles[fullPath] ? ' checked' : '';

			tbodyHtml += '<tr class="file-row" data-path="' + escapeHtml(fullPath) +
				'" data-type="' + entry.type + '">';
			tbodyHtml += '<td class="col-check"><input type="checkbox" class="file-checkbox"' + checked + '></td>';
			tbodyHtml += '<td class="col-icon">' + icon + '</td>';
			tbodyHtml += '<td class="col-name" title="' + escapeHtml(entry.name) + '">' + escapeHtml(entry.name) + '</td>';
			tbodyHtml += '<td class="col-size">' + sizeStr + '</td>';
			tbodyHtml += '<td class="col-date">' + dateStr + '</td>';
			tbodyHtml += '<td class="col-perms">' + permsStr + ' ' + escapeHtml(ownerStr) + '</td>';
			tbodyHtml += '</tr>';
		}

		tbodyHtml += '</tbody>';

		container.innerHTML = '<table class="cbi-section-table file-table">' + headHtml + tbodyHtml + '</table>';

		if (isLargeDir) {
			var totalPages = Math.ceil(totalFiles / self._pageSize);
			var paginationHtml = '<div class="pagination">';
			paginationHtml += '<span>' + _('第 ') + (self._currentPage + 1) + '/' + totalPages + _(' 页') + '</span> ';
			paginationHtml += '<button class="cbi-button" id="btn-prev-page"' + (self._currentPage === 0 ? ' disabled' : '') + '>' + _('上一页') + '</button> ';
			paginationHtml += '<button class="cbi-button" id="btn-next-page"' + (self._currentPage >= totalPages - 1 ? ' disabled' : '') + '>' + _('下一页') + '</button>';
			paginationHtml += '</div>';
			container.innerHTML += paginationHtml;
			container.innerHTML += '<div class="large-dir-hint">' + _('此目录包含大量文件，部分功能可能响应较慢。') + '</div>';
		}

		self._bindTableEvents(container);
		self._updateToolbarState();

		if (isLargeDir) {
			var prevBtn = container.querySelector('#btn-prev-page');
			var nextBtn = container.querySelector('#btn-next-page');
			if (prevBtn) {
				prevBtn.addEventListener('click', function() {
					if (self._currentPage > 0) {
						self._currentPage--;
						self._renderFileList(container);
					}
				});
			}
			if (nextBtn) {
				nextBtn.addEventListener('click', function() {
					var totalPages = Math.ceil(totalFiles / self._pageSize);
					if (self._currentPage < totalPages - 1) {
						self._currentPage++;
						self._renderFileList(container);
					}
				});
			}
		}
	},

	_sortFileList: function(list) {
		var self = this;
		var dirs = [];
		var files = [];

		for (var i = 0; i < list.length; i++) {
			if (list[i].type === 'directory') {
				dirs.push(list[i]);
			} else {
				files.push(list[i]);
			}
		}

		var sortFn;
		if (self._sortColumn === 'name') {
			sortFn = function(a, b) {
				return self._sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
			};
		} else if (self._sortColumn === 'size') {
			sortFn = function(a, b) {
				return self._sortAsc ? (a.size || 0) - (b.size || 0) : (b.size || 0) - (a.size || 0);
			};
		} else if (self._sortColumn === 'date') {
			sortFn = function(a, b) {
				return self._sortAsc ? (a.mtime || 0) - (b.mtime || 0) : (b.mtime || 0) - (a.mtime || 0);
			};
		} else if (self._sortColumn === 'mode') {
			sortFn = function(a, b) {
				return self._sortAsc ? (a.mode || 0) - (b.mode || 0) : (b.mode || 0) - (a.mode || 0);
			};
		}

		if (sortFn) {
			dirs.sort(sortFn);
			files.sort(sortFn);
		}

		return dirs.concat(files);
	},

	_sortIndicator: function(col) {
		var self = this;
		if (self._sortColumn !== col) return '';
		return self._sortAsc ? ' ↑' : ' ↓';
	},

	_bindTableEvents: function(container) {
		var self = this;

		var selectAll = container.querySelector('#fa-select-all');
		if (selectAll) {
			selectAll.addEventListener('change', function() {
				var checked = this.checked;
				var checkboxes = container.querySelectorAll('.file-checkbox');
				for (var i = 0; i < checkboxes.length; i++) {
					checkboxes[i].checked = checked;
					var row = checkboxes[i].closest('.file-row');
					if (row) {
						var path = row.getAttribute('data-path');
						if (checked) {
							self._selectedFiles[path] = true;
						} else {
							delete self._selectedFiles[path];
						}
					}
				}
				self._updateToolbarState();
			});
		}

		var checkboxes = container.querySelectorAll('.file-checkbox');
		for (var i = 0; i < checkboxes.length; i++) {
			(function(cb, index) {
				cb.addEventListener('change', function(ev) {
					var row = cb.closest('.file-row');
					if (!row) return;
					var path = row.getAttribute('data-path');
					var checked = cb.checked;

					if (ev.shiftKey && self._lastClickedIndex >= 0) {
						var start = Math.min(self._lastClickedIndex, index);
						var end = Math.max(self._lastClickedIndex, index);
						var allCheckboxes = container.querySelectorAll('.file-checkbox');
						for (var j = start; j <= end; j++) {
							var rangeRow = allCheckboxes[j].closest('.file-row');
							if (rangeRow) {
								var rangePath = rangeRow.getAttribute('data-path');
								allCheckboxes[j].checked = checked;
								if (checked) {
									self._selectedFiles[rangePath] = true;
								} else {
									delete self._selectedFiles[rangePath];
								}
							}
						}
					} else {
						if (checked) {
							self._selectedFiles[path] = true;
						} else {
							delete self._selectedFiles[path];
						}
					}

					self._lastClickedIndex = index;
					self._updateToolbarState();

					var allCbs = container.querySelectorAll('.file-checkbox');
					var allChecked = true;
					for (var k = 0; k < allCbs.length; k++) {
						if (!allCbs[k].checked) { allChecked = false; break; }
					}
					var sa = container.querySelector('#fa-select-all');
					if (sa) sa.checked = allChecked;
				});
			})(checkboxes[i], i);
		}

		var rows = container.querySelectorAll('.file-row');
		for (var j = 0; j < rows.length; j++) {
			(function(row) {
				row.addEventListener('dblclick', function() {
					var path = row.getAttribute('data-path');
					var type = row.getAttribute('data-type');
					if (type === 'directory') {
						self._navigate(path);
					} else if (type === 'symlink') {
						resolveSymlinkTarget(path).then(function(targetType) {
							if (targetType === 'directory') {
								self._navigate(path);
							} else {
								self._openFile(path);
							}
						});
					} else {
						self._openFile(path);
					}
				});
			})(rows[j]);
		}

		for (var k = 0; k < rows.length; k++) {
			(function(row) {
				row.addEventListener('contextmenu', function(ev) {
					ev.preventDefault();
					self._showContextMenu(ev, row);
				});

				var longPressTimer = null;
				row.addEventListener('touchstart', function(ev) {
					ev.preventDefault();
					var touch = ev.touches[0];
					var pageX = touch.pageX;
					var pageY = touch.pageY;
					longPressTimer = setTimeout(function() {
						self._showContextMenu({ pageX: pageX, pageY: pageY }, row);
					}, 500);
				});
				row.addEventListener('touchend', function() {
					if (longPressTimer) {
						clearTimeout(longPressTimer);
						longPressTimer = null;
					}
				});
				row.addEventListener('touchmove', function() {
					if (longPressTimer) {
						clearTimeout(longPressTimer);
						longPressTimer = null;
					}
				});
			})(rows[k]);
		}

		var parentRow = container.querySelector('.parent-row');
		if (parentRow) {
			parentRow.addEventListener('dblclick', function() {
				var path = parentRow.getAttribute('data-path');
				self._navigate(path);
			});
		}

		var headers = container.querySelectorAll('th[data-sort]');
		for (var m = 0; m < headers.length; m++) {
			(function(th) {
				th.addEventListener('click', function() {
					var col = th.getAttribute('data-sort');
					if (self._sortColumn === col) {
						self._sortAsc = !self._sortAsc;
					} else {
						self._sortColumn = col;
						self._sortAsc = true;
					}
					self._currentPage = 0;
					var listCont = document.getElementById('fa-list-container');
					if (listCont) self._renderFileList(listCont);
				});
			})(headers[m]);
		}
	},

	_updateToolbarState: function() {
		var self = this;
		var selected = Object.keys(self._selectedFiles);
		var count = selected.length;

		var btnDelete = document.getElementById('btn-delete');
		var btnRename = document.getElementById('btn-rename');
		var btnInstall = document.getElementById('btn-install');

		if (self._operating) {
			if (btnDelete) btnDelete.disabled = true;
			if (btnRename) btnRename.disabled = true;
			if (btnInstall) btnInstall.disabled = true;
			return;
		}

		if (btnDelete) btnDelete.disabled = (count === 0);
		if (btnRename) btnRename.disabled = (count !== 1);

		if (btnInstall) {
			if (count === 1) {
				var path = selected[0];
				var isApk = path.toLowerCase().endsWith('.apk');
				btnInstall.disabled = !isApk;
				btnInstall.style.display = isApk ? '' : 'none';
			} else {
				btnInstall.disabled = true;
				btnInstall.style.display = 'none';
			}
		}

		var sa = document.getElementById('fa-select-all');
		if (sa && self._fileList) {
			var checkboxes = document.querySelectorAll('.file-checkbox');
			var allChecked = checkboxes.length > 0;
			for (var i = 0; i < checkboxes.length; i++) {
				if (!checkboxes[i].checked) { allChecked = false; break; }
			}
			sa.checked = allChecked;
		}
	},

	// ========== 新建文件夹 ==========

	_onMkdir: function() {
		var self = this;
		showModal('input', {
			title: _('新建文件夹'),
			placeholder: _('请输入文件夹名称'),
			onConfirm: function(name) {
				if (!name) return;
				normalizePath(self._currentPath).then(function(normalizedDir) {
					if (!normalizedDir) {
						handleFsError({ message: _('当前路径不存在') }, _('新建文件夹'), self._currentPath);
						return;
					}
					var fullPath = concatPath(normalizedDir, name);
					fs.exec('mkdir', [fullPath]).then(function() {
						showFeedbackBanner({ type: 'success', message: _('文件夹已创建') });
						logOperation('mkdir', fullPath, _('成功'));
						return self._navigate(self._currentPath);
					}).catch(function(err) {
						handleFsError(err, _('新建文件夹'), fullPath);
					});
				});
			}
		});
	},

	// ========== 上传 ==========

	_onUpload: function() {
		if (isSystemCriticalDir(this._currentPath)) {
			showFeedbackBanner({ type: 'error', message: _('不允许上传文件到系统关键目录') });
			return;
		}
		var input = document.getElementById('fa-upload-input');
		if (input) input.click();
	},

	_startUpload: function(files) {
		var self = this;
		if (!files || files.length === 0) return;

		self._uploadQueue = [];
		var skipped = 0;
		for (var i = 0; i < files.length; i++) {
			if (files[i].size > self._maxUploadSize) {
				skipped++;
				showFeedbackBanner({
					type: 'error',
					message: _('文件过大，已跳过') + '：' + files[i].name +
						' (' + formatSize(files[i].size) + ' > ' + formatSize(self._maxUploadSize) + ')'
				});
			} else {
				self._uploadQueue.push(files[i]);
			}
		}

		if (self._uploadQueue.length === 0) return;

		self._uploadActive = 0;
		self._uploading = true;
		self._uploadSuccessCount = 0;
		self._uploadFailCount = skipped;

		var btnUpload = document.getElementById('btn-upload');
		var btnCancel = document.getElementById('btn-cancel-upload');
		if (btnUpload) btnUpload.style.display = 'none';
		if (btnCancel) btnCancel.style.display = '';

		self._processUploadQueue();
	},

	_processUploadQueue: function() {
		var self = this;

		while (self._uploadActive < 2 && self._uploadQueue.length > 0 && self._uploading) {
			var file = self._uploadQueue.shift();
			self._uploadActive++;
			self._uploadFile(file).then(function() {
				self._uploadActive--;
				self._processUploadQueue();
			});
		}

		if (self._uploadActive === 0 && self._uploadQueue.length === 0) {
			self._uploading = false;
			var btnUpload = document.getElementById('btn-upload');
			var btnCancel = document.getElementById('btn-cancel-upload');
			if (btnUpload) btnUpload.style.display = '';
			if (btnCancel) btnCancel.style.display = 'none';

			var totalMsg = _('上传完成：成功 ') + (self._uploadSuccessCount || 0) +
				_(' 个，失败 ') + (self._uploadFailCount || 0) + _(' 个');
			showFeedbackBanner({
				type: self._uploadFailCount > 0 ? 'error' : 'success',
				message: totalMsg
			});

			self._navigate(self._currentPath);
		}
	},

	_uploadFile: function(file) {
		var self = this;
		var fileName = file.name || 'unnamed';
		var timestamp = Date.now() + '-' + Math.random().toString(36).substr(2, 6);
		var tmpPath = concatPath(self._currentPath, '.' + fileName + '.' + timestamp + '.tmp');
		var finalPath = concatPath(self._currentPath, fileName);

		showFeedbackBanner({ type: 'success', message: _('正在上传') + '：' + fileName });

		return fs.write(tmpPath, file).then(function() {
			return fs.exec('mv', [tmpPath, finalPath]);
		}).then(function() {
			showFeedbackBanner({ type: 'success', message: _('上传成功') + '：' + fileName });
			logOperation('upload', finalPath, _('成功'));
			self._uploadSuccessCount = (self._uploadSuccessCount || 0) + 1;
		}).catch(function(err) {
			fs.remove(tmpPath).catch(function() {});
			handleFsError(err, _('上传'), fileName);
			self._uploadFailCount = (self._uploadFailCount || 0) + 1;
		});
	},

	_cancelUpload: function() {
		this._uploading = false;
		this._uploadQueue = [];
		var btnUpload = document.getElementById('btn-upload');
		var btnCancel = document.getElementById('btn-cancel-upload');
		if (btnUpload) btnUpload.style.display = '';
		if (btnCancel) btnCancel.style.display = 'none';
		showFeedbackBanner({ type: 'error', message: _('上传已取消') });
	},

	// ========== 删除 ==========

	_onDelete: function() {
		var self = this;
		var selected = Object.keys(self._selectedFiles);
		if (selected.length === 0) return;

		var msg;
		if (selected.length === 1) {
			msg = _('确定要删除 ') + selected[0] + _(' 吗？');
			var isDir = self._isSelectedDir(selected[0]);
			if (isDir) msg += '\n' + _('此操作将递归删除目录内所有内容。');
		} else {
			msg = _('确定要删除 ') + selected.length + _(' 个文件/目录吗？') + '\n\n';
			var showCount = Math.min(selected.length, 5);
			for (var i = 0; i < showCount; i++) {
				var displayPath = selected[i];
				if (displayPath.length > 50) displayPath = displayPath.substring(0, 47) + '...';
				msg += displayPath + '\n';
			}
			if (selected.length > 5) msg += '...及其他 ' + (selected.length - 5) + _(' 个项目');
		}

		showModal('confirm', {
			title: _('确认删除'),
			message: msg,
			onConfirm: function() {
				self._executeDelete(selected);
			}
		});
	},

	_isSelectedDir: function(path) {
		for (var i = 0; i < this._fileList.length; i++) {
			var fullPath = concatPath(this._currentPath, this._fileList[i].name);
			if (fullPath === path && this._fileList[i].type === 'directory') return true;
		}
		return false;
	},

	_executeDelete: function(paths) {
		var self = this;

		Promise.all(paths.map(function(p) { return normalizePath(p); }))
			.then(function(normalizedPaths) {
				for (var i = 0; i < normalizedPaths.length; i++) {
					if (!normalizedPaths[i]) {
						showFeedbackBanner({ type: 'error', message: _('路径不存在') + '：' + paths[i] });
						return;
					}
					if (!isPathAllowed(normalizedPaths[i])) {
						showFeedbackBanner({ type: 'error', message: _('不允许删除此路径') + '：' + paths[i] });
						return;
					}
				}

				self._operating = true;
				self._updateToolbarState();

				return fs.exec('rm', ['-rf'].concat(normalizedPaths)).then(function(result) {
					self._operating = false;
					self._selectedFiles = {};
					self._updateToolbarState();

					if (result.code === 0) {
						showFeedbackBanner({
							type: 'success',
							message: _('已删除 ') + normalizedPaths.length + _(' 个文件'),
							detail: result.stdout || ''
						});
						logOperation('delete', normalizedPaths.join(', '), _('成功'));
					} else {
						showFeedbackBanner({
							type: 'error',
							message: _('删除失败'),
							detail: result.stderr || ''
						});
						logOperation('delete', normalizedPaths.join(', '), _('失败'));
					}

					return self._navigate(self._currentPath);
				});
			}).catch(function(err) {
				self._operating = false;
				self._updateToolbarState();
				handleFsError(err, _('删除'), paths.join(', '));
				return self._navigate(self._currentPath);
			});
	},

	// ========== 重命名 ==========

	_onRename: function() {
		var self = this;
		var selected = Object.keys(self._selectedFiles);
		if (selected.length !== 1) return;

		var oldPath = selected[0];
		var oldName = oldPath.split('/').pop();

		showModal('input', {
			title: _('重命名'),
			placeholder: _('请输入新的文件名'),
			defaultValue: oldName,
			onConfirm: function(newName) {
				if (!newName || newName === oldName) {
					if (newName === oldName) {
						showFeedbackBanner({ type: 'success', message: _('文件名未变更') });
					}
					return;
				}
				self._executeRename(oldPath, newName);
			}
		});
	},

	_executeRename: function(oldPath, newName) {
		var self = this;
		var dir = oldPath.substring(0, oldPath.lastIndexOf('/'));

		normalizePath(dir).then(function(normalizedDir) {
			if (!normalizedDir) {
				handleFsError({ message: _('目录不存在') }, _('重命名'), dir);
				self._operating = false;
				self._updateToolbarState();
				return;
			}
			var safeOldPath = concatPath(normalizedDir, oldPath.split('/').pop());
			var newPath = concatPath(normalizedDir, newName);

			self._operating = true;
			self._updateToolbarState();

			return fs.exec('mv', ['-n', safeOldPath, newPath]).then(function(result) {
				if (result.code !== 0) {
					return new Promise(function(resolve) {
						showModal('confirm', {
							title: _('文件已存在'),
							message: _('目标文件名已存在，是否覆盖？'),
							onConfirm: function() {
								resolve(fs.exec('mv', ['-f', safeOldPath, newPath]));
							},
							onCancel: function() {
								resolve({ code: -1, stderr: 'cancelled' });
							}
						});
					});
				}
				return result;
			}).then(function(result) {
				self._operating = false;
				self._selectedFiles = {};
				self._updateToolbarState();

				if (result.code === 0) {
					showFeedbackBanner({ type: 'success', message: _('重命名成功') });
					logOperation('rename', oldPath + ' → ' + newPath, _('成功'));
				} else if (result.stderr !== 'cancelled') {
					showFeedbackBanner({ type: 'error', message: _('重命名失败'), detail: result.stderr || '' });
				}
				return self._navigate(dir);
			});
		}).catch(function(err) {
			self._operating = false;
			self._updateToolbarState();
			handleFsError(err, _('重命名'), oldPath);
		});
	},

	// ========== apk 安装 ==========

	_onInstall: function() {
		var self = this;
		var selected = Object.keys(self._selectedFiles);
		if (selected.length !== 1) return;

		var filePath = selected[0];

		showModal('confirm', {
			title: _('安装软件包'),
			message: _('此操作将安装系统软件包，确认继续？'),
			onConfirm: function() {
				self._executeInstall(filePath);
			}
		});
	},

	_executeInstall: function(filePath) {
		var self = this;
		self._operating = true;
		self._updateToolbarState();

		var btnInstall = document.getElementById('btn-install');
		if (btnInstall) {
			btnInstall.disabled = true;
			btnInstall.textContent = _('安装中...');
		}

		showFeedbackBanner({ type: 'success', message: _('正在安装...') });

		execWithTimeout('apk', ['add', '--allow-untrusted', filePath], 60000).then(function(result) {
			self._operating = false;
			self._updateToolbarState();
			if (btnInstall) btnInstall.textContent = _('安装 apk');

			if (result.code === 0) {
				showFeedbackBanner({
					type: 'success',
					message: _('安装成功。如涉及界面更新，请手动刷新页面。')
				});
				logOperation('apk-install', filePath, _('成功'));
			} else {
				showFeedbackBanner({
					type: 'error',
					message: _('安装失败，请检查系统日志。'),
					detail: result.stderr || result.stdout || ''
				});
				logOperation('apk-install', filePath, _('失败'));
			}
		}).catch(function(err) {
			self._operating = false;
			self._updateToolbarState();
			if (btnInstall) btnInstall.textContent = _('安装 apk');
			handleFsError(err, _('安装'), filePath);
		});
	},

	// ========== 右键菜单 ==========

	_showContextMenu: function(ev, row) {
		var self = this;
		var path = row.getAttribute('data-path');

		self._selectedFiles = {};
		self._selectedFiles[path] = true;
		self._updateToolbarState();

		var menu = document.getElementById('fa-context-menu');
		if (!menu) return;

		var ctxInstall = document.getElementById('ctx-install');
		if (ctxInstall) {
			ctxInstall.style.display = path.toLowerCase().endsWith('.apk') ? '' : 'none';
		}

		menu.style.display = 'block';
		menu.style.left = ev.pageX + 'px';
		menu.style.top = ev.pageY + 'px';

		self._contextMenuVisible = true;
		self._contextMenuPath = path;
		self._contextMenuType = row.getAttribute('data-type');

		setTimeout(function() {
			self._contextMenuVisible = true;
		}, 10);
	},

	_hideContextMenu: function() {
		var self = this;
		if (!self._contextMenuVisible) return;
		self._contextMenuVisible = false;
		var menu = document.getElementById('fa-context-menu');
		if (menu) menu.style.display = 'none';
	},

	_ctxOpen: function() {
		var self = this;
		var path = self._contextMenuPath;
		var type = self._contextMenuType;
		if (!path) return;

		if (type === 'symlink') {
			resolveSymlinkTarget(path).then(function(targetType) {
				if (targetType === 'directory') {
					self._navigate(path);
				} else {
					self._openFile(path);
				}
			});
		} else if (type === 'directory') {
			self._navigate(path);
		} else {
			self._openFile(path);
		}
	},

	_ctxDelete: function() {
		var path = this._contextMenuPath;
		if (!path) return;
		this._selectedFiles = {};
		this._selectedFiles[path] = true;
		this._onDelete();
	},

	_ctxRename: function() {
		var path = this._contextMenuPath;
		if (!path) return;
		this._selectedFiles = {};
		this._selectedFiles[path] = true;
		this._onRename();
	},

	_ctxInstall: function() {
		var path = this._contextMenuPath;
		if (!path) return;
		this._selectedFiles = {};
		this._selectedFiles[path] = true;
		this._onInstall();
	},

	// ========== 导航 ==========

	_navigate: function(path) {
		var self = this;
		return normalizePath(path).then(function(normalized) {
			if (!normalized) {
				handleFsError({ message: _('路径不存在') }, _('导航'), path);
				var inputEl = document.getElementById('fa-path-input');
				if (inputEl) inputEl.value = self._currentPath;
				return;
			}
			return self._doNavigate(normalized);
		});
	},

	_doNavigate: function(path) {
		var self = this;
		self._requestId++;
		var expectedId = self._requestId;
		self._currentPath = path;
		self._selectedFiles = {};
		self._lastClickedIndex = -1;
		self._currentPage = 0;

		var input = document.getElementById('fa-path-input');
		if (input) input.value = path;

		if (window.sessionStorage) {
			sessionStorage.setItem('luci-advanced-lastpath', path);
		}

		if (history.pushState) {
			history.pushState({ path: path }, '', '?path=' + encodeURIComponent(path));
		}

		return fs.list(path).then(function(fileList) {
			if (self._requestId !== expectedId) return;
			self._fileList = fileList;
			var container = document.getElementById('fa-list-container');
			if (container) self._renderFileList(container);
		}).catch(function(err) {
			if (self._requestId !== expectedId) return;
			self._fileList = null;
			var container = document.getElementById('fa-list-container');
			if (container) {
				container.innerHTML = '<div class="empty-dir">' + _('加载失败') + '</div>';
			}
			var inputEl = document.getElementById('fa-path-input');
			if (inputEl) inputEl.value = path;
			handleFsError(err, _('导航'), path);
		});
	},

	// ========== 文件预览/下载 ==========

	_openFile: function(filePath) {
		var self = this;
		var fileName = filePath.split('/').pop();
		var mime = getMimeType(fileName);

		var checkSize = (mime.startsWith('text/') || mime.startsWith('image/') ||
		                 mime === 'application/json' || mime === 'application/javascript' ||
		                 mime === 'application/pdf');

		fs.stat(filePath).then(function(stat) {
			if (checkSize && stat.size > 10 * 1024 * 1024) {
				showModal('confirm', {
					title: _('大文件提示'),
					message: _('文件大小超过 10MB，预览可能较慢。是否继续预览？点击取消将直接下载。'),
					onConfirm: function() { doPreview(filePath, fileName, mime); },
					onCancel: function() { doDownload(filePath, fileName); }
				});
			} else if (isPreviewableMime(mime)) {
				doPreview(filePath, fileName, mime);
			} else {
				doDownload(filePath, fileName);
			}
		}).catch(function() {
			if (isPreviewableMime(mime)) {
				doPreview(filePath, fileName, mime);
			} else {
				doDownload(filePath, fileName);
			}
		});
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});

// ========== 预览/下载 ==========

function doPreview(filePath, fileName, mime) {
	fs.read(filePath).then(function(content) {
		var blobContent;

		if (mime.startsWith('text/') || mime === 'application/json' ||
		    mime === 'application/javascript' || mime === 'application/xml' ||
		    mime === 'application/x-perl' || mime === 'application/x-shellscript' ||
		    mime === 'application/x-php') {
			var normalized = content.replace(/\r\n/g, '\n');
			var textBlob = new Blob([normalized], { type: 'text/plain;charset=utf-8' });
			var textBlobUrl = URL.createObjectURL(textBlob);
			var previewHtml = buildPreviewHtml(fileName, mime, '');
			previewHtml = previewHtml.replace('</body>',
				'<script>fetch("' + textBlobUrl + '").then(r=>r.text()).then(t=>{document.getElementById("content").textContent=t;})</script></body>');
			blobContent = new Blob([previewHtml], { type: 'text/html;charset=utf-8' });
		} else if (mime.startsWith('image/') || mime === 'image/svg+xml') {
			var imgBlob = new Blob([content], { type: mime });
			var imgBlobUrl = URL.createObjectURL(imgBlob);
			var imgHtml = buildPreviewHtml(fileName, mime, imgBlobUrl);
			blobContent = new Blob([imgHtml], { type: 'text/html;charset=utf-8' });
		} else if (mime.startsWith('audio/') || mime.startsWith('video/')) {
			var mediaBlob = new Blob([content], { type: mime });
			var mediaBlobUrl = URL.createObjectURL(mediaBlob);
			var mediaHtml = buildPreviewHtml(fileName, mime, mediaBlobUrl);
			blobContent = new Blob([mediaHtml], { type: 'text/html;charset=utf-8' });
		} else if (mime === 'application/pdf') {
			var pdfBlob = new Blob([content], { type: 'application/pdf' });
			var pdfBlobUrl = URL.createObjectURL(pdfBlob);
			var pdfHtml = buildPreviewHtml(fileName, mime, pdfBlobUrl);
			blobContent = new Blob([pdfHtml], { type: 'text/html;charset=utf-8' });
		} else {
			doDownload(filePath, fileName);
			return;
		}

		var blobUrl = URL.createObjectURL(blobContent);
		var newWindow = window.open(blobUrl);

		if (!newWindow) {
			alert(_('浏览器已拦截弹窗，请允许此网站弹出窗口后重试。'));
		}

		setTimeout(function() {
			URL.revokeObjectURL(blobUrl);
		}, 60000);
	}).catch(function(err) {
		// 预览失败静默处理
	});
}

function doDownload(filePath, fileName) {
	fs.read(filePath).then(function(content) {
		var blob = new Blob([content]);
		var url = URL.createObjectURL(blob);

		var a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);

		setTimeout(function() {
			URL.revokeObjectURL(url);
		}, 60000);
	}).catch(function(err) {
		// 下载失败静默处理
	});
}