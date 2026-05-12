'use strict';
'require view';
'require form';
'require uci';
'require fs';

return view.extend({
	load: function() {
		return uci.load('advanced');
	},

	render: function() {
		let m, s, o;

		m = new form.Map('advanced', _('高级设置'),
			_('<font color="Red"><strong>配置文档是直接编辑的除非你知道自己在干什么，否则请不要轻易修改这些配置文档。配置不正确可能会导致不能开机等错误。</strong></font>'));
		m.tabbed = true;

		// 读取所有 tab 配置并按 order 排序
		let tabs = uci.sections('advanced', 'tab').sort(function(a, b) {
			return (parseInt(a.order) || 0) - (parseInt(b.order) || 0);
		});

		let self = this;
		tabs.forEach(function(tab) {
			if (!tab.filepath) return;

			// 为每个 tab 创建一个 NamedSection
			s = m.section(form.NamedSection, tab['.name'], 'tab', tab.title || tab['.name']);
			s.anonymous = true;

			// 描述文本
			if (tab.description) {
				o = s.option(form.DummyValue, '_desc_' + tab['.name'], '');
				o.rawhtml = true;
				o.cfgvalue = function() {
					return '<div class="cbi-section-descr">' + tab.description + '</div>';
				};
			}

			// 文件内容编辑框
			o = s.option(form.TextValue, 'content_' + tab['.name'], '');
			o.rows = parseInt(tab.rows) || 25;
			o.wrap = 'off';
			o.monospace = true;
			o.placeholder = _('文件内容加载中...');

			// 读取文件内容
			o.load = function(section_id) {
				return fs.read(tab.filepath).catch(function(err) {
					return '';
				});
			};

			// 保存文件内容
			o.write = function(section_id, value) {
				if (value == null) return;

				// 标准化换行符
				value = value.replace(/\r\n?/g, '\n');

				let tmpPath = '/tmp/advanced_' + tab['.name'] + '.tmp';

				return fs.write(tmpPath, value).then(function() {
					return fs.exec('/usr/bin/cmp', ['-s', tmpPath, tab.filepath]);
				}).then(function(res) {
					if (res.code !== 0) {
						// 文件有变化，写入并重启服务
						return fs.write(tab.filepath, value).then(function() {
							if (tab.restart) {
								return fs.exec('/bin/sh', ['-c', tab.restart]);
							}
						});
					}
				}).finally(function() {
					return fs.remove(tmpPath);
				});
			};
		});

		return m.render();
	}
});
