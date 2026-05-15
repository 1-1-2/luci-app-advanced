'use strict';
'require view';
'require fs';
'require ui';

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

// ========== 全局样式注入 ==========
var _stylesInjected = false;

function injectStyles() {
	if (_stylesInjected) return;
	if (!document.head) return;
	_stylesInjected = true;

	var css = [
		'.advanced-container { padding: 1rem; }',
		'.advanced-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }',
		'.advanced-header h2 { margin: 0; }',
		'.legend { font-size: 0.85rem; color: #666; white-space: nowrap; }',
		'.tab-bar { display: flex; border-bottom: 2px solid #ccc; margin-bottom: 0; }',
		'.tab-button { padding: 0.5rem 1rem; border: none; background: #eee; cursor: pointer; border-radius: 4px 4px 0 0; margin-right: 2px; font-size: 0.9rem; }',
		'.tab-button:hover { background: #ddd; }',
		'.tab-active { background: #fff; border: 2px solid #ccc; border-bottom-color: #fff; font-weight: bold; }',
		'.tab-panel { border: 2px solid #ccc; border-top: none; padding: 0; background: #fff; }',
		'.config-textarea { width: 100%; min-height: 20rem; font-family: monospace; font-size: 0.85rem; padding: 0.5rem; border: none; resize: vertical; box-sizing: border-box; }',
		'.risk-warning { padding: 0.5rem 1rem; color: #856404; background: #fff3cd; font-size: 0.85rem; }',
		'.load-error { padding: 1rem; color: #721c24; background: #f8d7da; }',
		'.external-change-hint { padding: 0.5rem 1rem; color: #856404; background: #fff3cd; font-size: 0.85rem; animation: fadeInOut 5s forwards; }',
		'.feedback-banner { padding: 0.6rem 1rem; margin-bottom: 0.5rem; border-radius: 3px; font-size: 0.9rem; }',
		'.cbi-section-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }',
		'.cbi-section-error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }',
		'.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); z-index: 9999; display: flex; align-items: center; justify-content: center; }',
		'.modal-dialog { background: #fff; border-radius: 6px; padding: 1.5rem; min-width: 300px; max-width: 80vw; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }',
		'.modal-title { margin: 0 0 0.5rem 0; }',
		'.modal-body { margin-bottom: 1rem; }',
		'.modal-body p { margin: 0.3rem 0; }',
		'.modal-input { width: 100%; padding: 0.4rem; border: 1px solid #ccc; border-radius: 3px; font-size: 0.9rem; box-sizing: border-box; }',
		'.modal-buttons { display: flex; gap: 0.5rem; justify-content: flex-end; }'
	].join('\n');

	var styleEl = E('style', { 'type': 'text/css' }, [css]);
	document.head.appendChild(styleEl);
}

document.addEventListener('DOMContentLoaded', function() {
	injectStyles();
});

// ========== 15 个配置文件定义 ==========
var CONFIG_FILES = [
	{ id: 'networkconf',   name: _('网络'),     path: '/etc/config/network',      service: 'network',   risky: true  },
	{ id: 'wirelessconf',  name: _('无线'),     path: '/etc/config/wireless',     service: 'network',   risky: true  },
	{ id: 'firewallconf',  name: _('防火墙'),   path: '/etc/config/firewall',     service: 'firewall',  risky: true  },
	{ id: 'dhcpconf',      name: _('DHCP'),     path: '/etc/config/dhcp',         service: 'dnsmasq',   risky: true  },
	{ id: 'dnsmasqconf',   name: _('dnsmasq'),  path: '/etc/dnsmasq.conf',        service: 'dnsmasq',   risky: true  },
	{ id: 'hostsconf',     name: _('hosts'),    path: '/etc/hosts',               service: null,        risky: false },
	{ id: 'arpbindconf',   name: _('ARP绑定'),  path: '/etc/config/arpbind',      service: 'arpbind',   risky: false },
	{ id: 'mwan3conf',     name: _('负载均衡'), path: '/etc/config/mwan3',         service: 'mwan3',     risky: false },
	{ id: 'ddnsconf',      name: _('DDNS'),     path: '/etc/config/ddns',         service: 'ddns',      risky: false },
	{ id: 'parentcontrolconf', name: _('家长控制'), path: '/etc/config/parentcontrol', service: 'parentcontrol', risky: false },
	{ id: 'autotimesetconf',   name: _('定时设置'), path: '/etc/config/autotimeset',   service: 'autotimeset',   risky: false },
	{ id: 'wolplusconf',       name: _('网络唤醒'), path: '/etc/config/wolplus',       service: 'wolplus',       risky: false },
	{ id: 'smartdnsconf',      name: _('SMARTDNS'), path: '/etc/config/smartdns',      service: 'smartdns',      risky: false },
	{ id: 'bypassconf',        name: _('BYPASS'),   path: '/etc/config/bypass',        service: 'bypass',        risky: false },
	{ id: 'openclashconf',     name: _('openclash'), path: '/etc/config/openclash',    service: 'openclash',     risky: false }
];

// ========== 红绿灯状态机 ==========
var LightState = {
	INIT:       'init',
	INACTIVE:   'inactive',
	LOADING:    'loading',
	SYNCED:     'synced',
	MODIFIED:   'modified',
	ERROR:      'error'
};

var LightEmoji = {
	'init':      '',
	'inactive':  '',
	'loading':   '⚪ ',
	'synced':    '🟢 ',
	'modified':  '🟡 ',
	'error':     '🔴 '
};

function trafficLightTransition(currentState, event) {
	var transitions = {
		'init': {
			'load_done_exists':    LightState.INACTIVE,
			'load_done_notexists': 'removed'
		},
		'inactive': {
			'first_click': LightState.LOADING
		},
		'loading': {
			'rpc_success':        LightState.SYNCED,
			'rpc_error':          LightState.ERROR,
			'switch_away_nocache': LightState.INACTIVE,
			'switch_away_cached':  'cached_state'
		},
		'synced': {
			'user_edit':       LightState.MODIFIED,
			'external_change': LightState.MODIFIED
		},
		'modified': {
			'save_success':             LightState.SYNCED,
			'save_error':               LightState.ERROR,
			'external_change_no_local': LightState.MODIFIED,
			'external_restored':        LightState.SYNCED,
			'external_change':          LightState.MODIFIED
		},
		'error': {
			'retry': LightState.LOADING
		}
	};

	if (transitions[currentState] && transitions[currentState][event] !== undefined) {
		return transitions[currentState][event];
	}
	return currentState;
}

// ========== 每个标签页的状态管理 ==========
function TabState(config) {
	this.config = config;
	this.light = LightState.INIT;
	this.content = null;
	this.baseline = null;
	this.lastSaved = null;
	this.active = false;
}

TabState.prototype = {
	getDisplayName: function() {
		var emoji = LightEmoji[this.light] || '';
		return emoji + this.config.name;
	},

	setLight: function(newState) {
		this.light = newState;
	},

	isClickable: function() {
		return this.light !== LightState.INIT;
	}
};

// ========== 超时包装函数 ==========
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

// ========== 主视图 ==========
return view.extend({
	_tabs: [],
	_activeIndex: -1,
	_fileContentCache: {},
	_saving: false,
	_inputRaf: null,

	load: function() {
		var self = this;
		var statPromises = CONFIG_FILES.map(function(cfg) {
			return L.resolveDefault(fs.stat(cfg.path), null);
		});

		return Promise.all(statPromises).then(function(results) {
			self._tabs = [];
			for (var i = 0; i < CONFIG_FILES.length; i++) {
				if (results[i] !== null) {
					var ts = new TabState(CONFIG_FILES[i]);
					ts.setLight(LightState.INACTIVE);
					self._tabs.push(ts);
				}
			}
			return self._tabs;
		});
	},

	render: function() {
		var self = this;
		var body = E('div', { 'class': 'advanced-container' });

		var headerRow = E('div', { 'class': 'advanced-header' }, [
			E('h2', {}, [_('高级设置')]),
			E('span', { 'class': 'legend' }, [
				'⚪ ' + _('加载中') + '  ',
				'🟢 ' + _('一致') + '  ',
				'🟡 ' + _('不一致') + '  ',
				'🔴 ' + _('异常')
			])
		]);
		body.appendChild(headerRow);

		var tabBar = E('div', { 'class': 'tab-bar' });
		var tabContents = E('div', { 'class': 'tab-contents' });

		for (var i = 0; i < self._tabs.length; i++) {
			(function(idx) {
				var ts = self._tabs[idx];

				var tabBtn = E('button', {
					'class': 'tab-button',
					'data-index': idx,
					'click': function() { self._onTabClick(idx); }
				}, [ts.getDisplayName()]);

				tabBar.appendChild(tabBtn);

				var panel = E('div', {
					'class': 'tab-panel',
					'id': 'tab-panel-' + idx,
					'style': 'display:none;'
				});

				var textarea = E('textarea', {
					'class': 'config-textarea',
					'id': 'tab-textarea-' + idx,
					'placeholder': '',
					'input': function() {
						self._onContentChange(idx);
					}
				});
				panel.appendChild(textarea);

				if (ts.config.risky) {
					panel.appendChild(E('div', { 'class': 'risk-warning' }, [
						_('注意：修改网络配置可能导致设备不可达，请确保了解所做更改的含义。')
					]));
				}

				tabContents.appendChild(panel);
			})(i);
		}

		body.appendChild(tabBar);
		body.appendChild(tabContents);

		var banner = E('div', {
			'class': 'feedback-banner',
			'id': 'feedback-banner',
			'style': 'display:none;'
		});
		body.appendChild(banner);

		return body;
	},

	_onTabClick: function(idx) {
		var self = this;
		var ts = self._tabs[idx];

		if (!ts.isClickable()) return;
		if (self._activeIndex === idx) return;

		if (ts.light === LightState.INACTIVE) {
			ts.setLight(LightState.LOADING);
			self._updateTabDisplay(idx);

			fs.read(ts.config.path).then(function(content) {
				content = normalizeNewlines(content);
				ts.content = content;
				ts.baseline = content;
				ts.lastSaved = content;
				ts.setLight(LightState.SYNCED);
				self._updateTabDisplay(idx);
				self._fillTextarea(idx, content);
			}).catch(function(err) {
				ts.setLight(LightState.ERROR);
				self._updateTabDisplay(idx);
				self._showLoadError(idx, err);
			});
		}

		self._activateTab(idx);
	},

	_activateTab: function(idx) {
		var self = this;
		var oldIdx = self._activeIndex;

		if (oldIdx >= 0) {
			var oldPanel = document.getElementById('tab-panel-' + oldIdx);
			if (oldPanel) oldPanel.style.display = 'none';
		}

		self._activeIndex = idx;
		var newPanel = document.getElementById('tab-panel-' + idx);
		if (newPanel) newPanel.style.display = 'block';

		var ts = self._tabs[idx];
		if (ts.content !== null) {
			self._fillTextarea(idx, ts.content);
		}

		if (ts.baseline !== null && ts.light !== LightState.INACTIVE && ts.light !== LightState.INIT) {
			fs.read(ts.config.path).then(function(serverContent) {
				serverContent = normalizeNewlines(serverContent);

				var textarea = document.getElementById('tab-textarea-' + idx);
				var localContent = textarea ? normalizeNewlines(textarea.value) : ts.content;

				if (self._activeIndex !== idx) {
					ts.baseline = serverContent;
					return;
				}

				if (serverContent !== ts.baseline) {
					ts.baseline = serverContent;
					ts.lastSaved = null;

					var newState = trafficLightTransition(ts.light, 'external_change');
					ts.setLight(newState);
					self._updateTabDisplay(idx);

					if (localContent === ts.baseline) {
						self._showExternalChangeHint(idx, false);
					} else {
						self._showExternalChangeHint(idx, true);
					}
				} else if (serverContent === ts.baseline && localContent === serverContent) {
					ts.setLight(LightState.SYNCED);
					self._updateTabDisplay(idx);
				}
			}).catch(function(err) {
				logOperation('校验', ts.config.path, '失败: ' + escapeHtml(err.message || err));
			});
		}

		self._updateTabButtons();
	},

	_fillTextarea: function(idx, content) {
		var textarea = document.getElementById('tab-textarea-' + idx);
		if (textarea) {
			textarea.value = content;
			if (content === '') {
				textarea.placeholder = _('（此文件为空）');
			} else {
				textarea.placeholder = '';
			}
		}
	},

	_showLoadError: function(idx, err) {
		var self = this;
		var panel = document.getElementById('tab-panel-' + idx);
		if (panel) {
			var existing = panel.querySelector('.load-error');
			if (existing) existing.parentNode.removeChild(existing);
			var errDiv = E('div', { 'class': 'load-error' }, [
				_('无法加载文件内容') + '：' + escapeHtml(err.message || err),
				E('button', {
					'class': 'cbi-button',
					'click': function() {
						var ts = self._tabs[idx];
						ts.setLight(LightState.LOADING);
						self._updateTabDisplay(idx);
						fs.read(ts.config.path).then(function(content) {
							content = normalizeNewlines(content);
							ts.content = content;
							ts.baseline = content;
							ts.lastSaved = content;
							ts.setLight(LightState.SYNCED);
							self._updateTabDisplay(idx);
							self._fillTextarea(idx, content);
							var errEl = panel.querySelector('.load-error');
							if (errEl) errEl.parentNode.removeChild(errEl);
						}).catch(function(err2) {
							ts.setLight(LightState.ERROR);
							self._updateTabDisplay(idx);
							handleFsError(err2, _('重试加载'), ts.config.path);
						});
					}
				}, [_('重试')])
			]);
			panel.insertBefore(errDiv, panel.firstChild);
		}
	},

	_showExternalChangeHint: function(idx, hasLocalChanges) {
		var panel = document.getElementById('tab-panel-' + idx);
		if (!panel) return;

		var oldHint = panel.querySelector('.external-change-hint');
		if (oldHint) oldHint.parentNode.removeChild(oldHint);

		var msg;
		if (hasLocalChanges) {
			msg = _('此文件已被外部修改，你的本地修改与外部修改可能存在冲突。保存将覆盖外部修改，重置将丢弃你的本地修改。建议先复制你的修改内容到本地，然后点击[重置]加载最新文件，再手动合并你的修改。');
		} else {
			msg = _('此文件已被外部修改，点击[重置]加载最新内容');
		}

		var hintDiv = E('div', { 'class': 'external-change-hint' }, [
			'⚡ ' + msg
		]);
		panel.insertBefore(hintDiv, panel.firstChild);

		setTimeout(function() {
			var hint = panel.querySelector('.external-change-hint');
			if (hint) hint.parentNode.removeChild(hint);
		}, 5000);
	},

	_onContentChange: function(idx) {
		var self = this;
		var ts = self._tabs[idx];
		if (self._activeIndex !== idx) return;

		var panel = document.getElementById('tab-panel-' + idx);
		if (panel) {
			var hint = panel.querySelector('.external-change-hint');
			if (hint) hint.parentNode.removeChild(hint);
		}

		if (self._inputRaf) return;
		self._inputRaf = requestAnimationFrame(function() {
			self._inputRaf = null;

			var textarea = document.getElementById('tab-textarea-' + idx);
			if (!textarea) return;

			var content = normalizeNewlines(textarea.value);
			ts.content = content;

			if (ts.baseline !== null && content !== ts.baseline) {
				ts.setLight(LightState.MODIFIED);
			} else if (ts.baseline !== null) {
				ts.setLight(LightState.SYNCED);
			}

			self._updateTabDisplay(idx);
		});
	},

	_updateTabDisplay: function(idx) {
		var tabBtn = document.querySelector('.tab-button[data-index="' + idx + '"]');
		if (tabBtn) {
			tabBtn.textContent = this._tabs[idx].getDisplayName();
		}
	},

	_updateTabButtons: function() {
		var self = this;
		var buttons = document.querySelectorAll('.tab-button');
		for (var i = 0; i < buttons.length; i++) {
			var idx = parseInt(buttons[i].getAttribute('data-index'));
			if (idx === self._activeIndex) {
				buttons[i].classList.add('tab-active');
			} else {
				buttons[i].classList.remove('tab-active');
			}
		}
	},

	handleSave: function() {
		var self = this;

		if (self._saving) return Promise.resolve({ status: 'locked' });
		self._saving = true;

		if (self._activeIndex < 0) {
			self._saving = false;
			return Promise.resolve({ status: 'error', msg: _('没有激活的标签页') });
		}

		var ts = self._tabs[self._activeIndex];
		var textarea = document.getElementById('tab-textarea-' + self._activeIndex);
		if (!textarea) {
			self._saving = false;
			return Promise.resolve({ status: 'error', msg: _('找不到文本域') });
		}

		var content = normalizeNewlines(textarea.value);

		if (content === ts.lastSaved) {
			self._saving = false;
			showFeedbackBanner({ type: 'success', message: _('内容未变更，已跳过保存') });
			return Promise.resolve({ status: 'unchanged' });
		}

		var tabName = ts.config.id;
		var timestamp = Date.now() + '-' + Math.random().toString(36).substr(2, 6);
		var tmpPath = '/tmp/luci-advanced-' + tabName + '-' + timestamp + '.tmp';
		var targetPath = ts.config.path;

		return fs.stat(targetPath).then(function() {
			return fs.exec('rm', ['-f', '/tmp/luci-advanced-' + tabName + '-*'])
				.then(function() {
					return fs.write(tmpPath, content);
				})
				.then(function() {
					return execWithTimeout('cmp', ['-s', tmpPath, targetPath], 15000);
				})
				.then(function(cmpResult) {
					if (cmpResult.code !== 0) {
						return execWithTimeout('cp', [tmpPath, targetPath], 15000)
							.then(function() {
								fs.remove(tmpPath).catch(function() {});
								ts.lastSaved = content;
								ts.baseline = content;
								return { status: 'saved' };
							});
					} else {
						fs.remove(tmpPath).catch(function() {});
						return { status: 'unchanged' };
					}
				});
		}).catch(function(err) {
			fs.remove(tmpPath).catch(function() {});
			if (err.code === 'ENOENT') {
				ts.setLight(LightState.ERROR);
				self._updateTabDisplay(self._activeIndex);
				showFeedbackBanner({ type: 'error', message: _('文件不存在，无法保存') });
				return { status: 'error', msg: _('文件不存在，无法保存') };
			}
			handleFsError(err, _('保存'), targetPath);
			return { status: 'error', msg: err.message || err.stderr || _('未知错误') };
		}).finally(function() {
			self._saving = false;
		});
	},

	handleSaveApply: function() {
		var self = this;

		return this.handleSave().then(function(result) {
			if (result.status === 'saved') {
				var ts = self._tabs[self._activeIndex];
				if (!ts.config.service) {
					showFeedbackBanner({ type: 'success', message: _('保存成功。') });
					ts.setLight(LightState.SYNCED);
					self._updateTabDisplay(self._activeIndex);
					return { status: 'saved', restarted: false, msg: _('保存成功，无需重启。') };
				}

				return execWithTimeout('/etc/init.d/' + ts.config.service, ['restart'], 30000)
					.then(function(restartResult) {
						ts.setLight(LightState.SYNCED);
						self._updateTabDisplay(self._activeIndex);
						if (restartResult.code === 0) {
							showFeedbackBanner({ type: 'success', message: _('保存成功，服务已重启。') });
							return { status: 'saved', restarted: true, msg: _('保存成功，服务已重启。') };
						} else {
							showFeedbackBanner({
								type: 'error',
								message: _('保存成功，但服务重启失败') + '：' + (restartResult.stderr || ''),
								detail: restartResult.stderr || ''
							});
							return { status: 'saved', restarted: false, msg: _('保存成功，但服务重启失败。') };
						}
					})
					.catch(function(err) {
						showFeedbackBanner({
							type: 'error',
							message: _('保存成功，但服务重启失败') + '：' + (err.message || err.stderr || ''),
							detail: err.message || err.stderr || ''
						});
						return { status: 'saved', restarted: false, msg: _('保存成功，但服务重启超时或失败。') };
					});
			} else if (result.status === 'unchanged') {
				showFeedbackBanner({ type: 'success', message: _('内容未变更，已跳过保存。') });
				return result;
			} else {
				var ts = self._tabs[self._activeIndex];
				if (ts) {
					ts.setLight(LightState.ERROR);
					self._updateTabDisplay(self._activeIndex);
				}
				return result;
			}
		}).catch(function(err) {
			var ts = self._tabs[self._activeIndex];
			if (ts) {
				ts.setLight(LightState.ERROR);
				self._updateTabDisplay(self._activeIndex);
			}
			handleFsError(err, _('保存'), '');
			return { status: 'error', msg: err.message || err.stderr || _('未知错误') };
		});
	},

	handleReset: function() {
		var self = this;

		if (self._activeIndex < 0) return Promise.resolve();

		var ts = self._tabs[self._activeIndex];

		if (ts.light === LightState.MODIFIED) {
			return new Promise(function(resolve) {
				showModal('confirm', {
					title: _('确认重置'),
					message: _('重置将丢弃所有未保存的修改，确定继续？'),
					onConfirm: function() {
						resolve(self._doReset());
					},
					onCancel: function() {
						resolve({ status: 'cancelled' });
					}
				});
			});
		}

		return self._doReset();
	},

	_doReset: function() {
		var self = this;
		var ts = self._tabs[self._activeIndex];

		ts.setLight(LightState.LOADING);
		self._updateTabDisplay(self._activeIndex);

		return fs.read(ts.config.path).then(function(content) {
			content = normalizeNewlines(content);
			ts.content = content;
			ts.baseline = content;
			ts.lastSaved = content;
			ts.setLight(LightState.SYNCED);
			self._updateTabDisplay(self._activeIndex);
			self._fillTextarea(self._activeIndex, content);
			showFeedbackBanner({ type: 'success', message: _('已重置为服务器最新内容。') });
			return { status: 'reset' };
		}).catch(function(err) {
			ts.setLight(LightState.ERROR);
			self._updateTabDisplay(self._activeIndex);
			handleFsError(err, _('重置'), ts.config.path);
			return { status: 'error', msg: err.message || err };
		});
	}
});