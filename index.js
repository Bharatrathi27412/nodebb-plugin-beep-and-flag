'use strict';

var winston = require.main.require('winston');
var meta = require.main.require('./src/meta');
var Flags = require.main.require('./src/flags');

var translator = require.main.require('./src/translator');

var toRegExp = require('./lib/toRegExp');
var parseContent = require('./lib/parseContent');

var defaultBanList = [
	'anal', 'anus', 'arse', 'ass', 'ballsack', 'balls', 'bastard', 'bitch', 'biatch', 'bloody',
	'blowjob', 'blow job', 'bollock', 'bollok', 'boner', 'boob', 'bugger', 'bum', 'butt', 'buttplug',
	'clitoris', 'cock', 'coon', 'crap', 'cunt', 'damn', 'dick', 'dildo', 'dyke', 'fag', 'feck',
	'fellate', 'fellatio', 'felching', 'fuck', 'f u c k', 'fudgepacker', 'fudge packer', 'flange',
	'homo', 'jerk', 'jizz', 'knobend', 'knob end', 'labia', 'muff', 'nigger', 'nigga', 'penis',
	'piss', 'poop', 'prick', 'pube', 'pussy', 'queer', 'sex', 'shit', 's hit', 'sh1t', 'slut',
	'smegma', 'spunk', 'tit', 'tosser', 'turd', 'twat', 'vagina', 'wank', 'whore',
];

var Beep = {
	banned_words_raw: '',
	banned_words: null,
	banned_urls: null,
	illegal_words: null,

	parseContent: function (content, symbol) {
		var nil = '^(?!x)x';
		return parseContent(content, Beep.banned_words || nil, Beep.banned_urls || nil, Beep.censorWholeWord, symbol || '&ast;');
	},
	toRegExp: toRegExp,
	loadList: function (callback) {
		// Load Banned Words from config
		meta.settings.get('beep', function (err, hash) {
			if (err) {
				return callback(err);
			}

			Beep.illegal_words = Beep.toRegExp(hash.illegal, true);

			if (hash.id && hash.id.length) {
				var words = hash.id.split(',').filter(function (word) {
					return !Beep.illegal_words.test(word);
				});
				Beep.banned_words = Beep.toRegExp(words, true);
				Beep.banned_words_raw = hash.id;
			} else {
				Beep.banned_words = Beep.toRegExp(defaultBanList, true);
				Beep.banned_words_raw = defaultBanList.join(', ');
				winston.info('Default list of Banned Words is enabled. Please go to administration panel to change the list.');
			}

			Beep.banned_urls = Beep.toRegExp(hash.urls);

			Beep.censorWholeWord = hash.censorWholeWord === 'on';
			if (meta.config) {
				meta.config.beep = meta.config.beep || {};
				meta.config.beep.censorWholeWord = Beep.censorWholeWord;
			}

			callback();
		});
	},

	init: function (params, callback) {
		var router = params.router;
		var middleware = params.middleware;

		function render(req, res, next) {
			res.render('admin/plugins/beep', {});
		}
		router.get('/admin/plugins/beep', middleware.admin.buildHeader, render);
		router.get('/api/admin/plugins/beep', render);
		router.get('/api/plugins/beep', function (req, res) {
			if (Beep.banned_words) {
				res.status(200).send(Beep.banned_words_raw);
			} else {
				res.status(501);
			}
		});
		Beep.loadList(callback);
	},
	appendConfig: function (config, callback) {
		meta.settings.getOne('beep', 'censorWholeWord', function (err, censorWholeWord) {
			if (err) {
				return callback(null, config);
			}
			config.beep = {
				censorWholeWord: censorWholeWord === 'on',
			};
			callback(err, config);
		});
	},
	checkForIllegalWords: function (data, callback) {
		var postContent = data.content || data.data && data.data.content;
		var postTitle = data.title || data.topic && data.topic.title;

		var titleMatch = postTitle && postTitle.match(Beep.illegal_words);
		if (titleMatch) {
			translator.translate('[[beep:titleMatch.error, ' + titleMatch[0] + ']]', function (translated) {
				callback(new Error(translated));
			});
			return;
		}
		var contentMatch = postContent && postContent.match(Beep.illegal_words);
		if (contentMatch) {
			translator.translate('[[beep:contentMatch.error, ' + contentMatch[0] + ']]', function (translated) {
				callback(new Error(translated));
			});
			return;
		}

		callback(null, data);
	},
	onListChange: function (hash) {
		if (hash && hash.plugin === 'beep') {
			Beep.loadList(function () {});
		}
	},
	parse: function (data, callback) {
		if (!data || !data.postData || !data.postData.content) {
			return callback(null, data);
		}
		data.postData.content = Beep.parseContent(data.postData.content);
		callback(null, data);
	},
	parseRaw: function (content, callback) {
		if (!content) {
			return callback(null, content);
		}
		content = Beep.parseContent(content);
		callback(null, content);
	},
	parseSignature: function (data, callback) {
		if (!data || !data.userData || !data.userData.signature) {
			return callback(null, data);
		}
		data.userData.signature = Beep.parseContent(data.userData.signature);
		callback(null, data);
	},
	parseTopic: function (data, callback) {
		// from http://htmlarrows.com/symbols/
		var starHTML = '*';

    if (data.topic.hasOwnProperty('title')) {
      data.topic.title = Beep.parseContent(data.topic.title, starHTML);
    }

    if (data.topic.hasOwnProperty('slug')) {
      data.topic.slug = Beep.parseContent(data.topic.slug, starHTML);
    }

    if (data.topic.hasOwnProperty('titleRaw')) {
      data.topic.titleRaw = Beep.parseContent(data.topic.titleRaw, starHTML);
    }

		callback(null, data);
	},
	filterTags: function (data, callback) {
		var match;
		data.tags.some(function (tag) {
			match = tag && tag.match(Beep.illegal_words);
			return !!match;
		});

		if (match) {
			translator.translate('[[beep:tagMatch.error, ' + match[0] + ']]', function (translated) {
				callback(new Error(translated));
			});
			return;
		}

		data.tags = data.tags.map(function (tag) {
			return Beep.parseContent(tag, '+');
		});

		callback(null, data);
	},

	shouldFlagged: function(data) {
		console.log('hi, in shouldFlagged');
		// console.log(data);
		const regex = /\b([A-Za-z]+)\*+([A-Za-z]+)\b/gi;
		// const regex = /([A-Za-z]+)\*([A-Za-z]+)/gi;
		const text = data.post.content;
		// const sanitizedText = text.replace(/<[^>]+>/g, "");
		// console.log(sanitizedText);
		const flagger = regex.test(text);
		console.log(flagger)
		if(flagger){
			Flags.create("post", data.post.pid, data.post.uid, "Offensive")
		}
		return data;
	},

	postQueue: function({ shouldQueue,uid, data }) {
		var starHTML = '*';
		var badWordContent = Beep.parseContent(data.content, starHTML);
		var badWordTitle = Beep.parseContent(data.title, starHTML);
		const regex = /\b([A-Za-z]+)\*+([A-Za-z]+)\b/gi;
		const flaggerContent = regex.test(badWordContent);
		const flaggerTitle = regex.test(badWordTitle);
		if(flaggerContent || flaggerTitle){
			// Flags.create("post", data.post.pid, data.post.uid, "Offensive");
			shouldQueue = true;
		}
		
		return ({ shouldQueue, uid, data });
	},

	admin: {
		menu: function (custom_header, callback) {
			custom_header.plugins.push({
				route: '/plugins/beep',
				icon: 'fa-microphone-slash',
				name: 'Censor Curse Words',
			});
			callback(null, custom_header);
		},
	},
	post: {
		getFields: function (data, callback) {
			if (data.fields.indexOf('content') !== -1) {
				data.posts.forEach(function (post) {
					post.content = Beep.parseContent(post.content);
				});
			}
			callback(null, data);
		},
	},
	messaging: {
		getTeaser: function (data, callback) {
			data.teaser.content = Beep.parseContent(data.teaser.content);
			callback(null, data);
		},
	},
};

module.exports = Beep;
