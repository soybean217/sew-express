'use strict';
var express = require('express');
var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var path = require('path');
var sign = require('./sign.js');
var CONFIG = require('./config.js');
var globalInfo = require('./globalInfo.js');
var app = express();
var mysql = require('mysql');
var url = require('url');
var fs = require("fs");
var pu = require('./privateUtil.js');

var log4js = require('log4js');

var logger = log4js.getLogger();
// log4js.configure({ 
// 	appenders: [{  
// 		type: 'console',
// 		  layout: {   
// 			type: 'pattern',
// 			   pattern: '[%r] [%[%5.5p%]] - %m%n'  
// 		} 
// 	}]
// })
// logger.setLevel(CONFIG.LOG_LEVEL);
// logger.appender.layout.pattern("[%h %x{pid}] - [%d] [%p] %c %m");
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();

var COS = require('cos-nodejs-sdk-v5');

var cos = new COS({
	AppId: CONFIG.QCLOUD_PARA.AppId,
	SecretId: CONFIG.QCLOUD_PARA.SecretId,
	SecretKey: CONFIG.QCLOUD_PARA.SecretKey,
	// 可选参数
	FileParallelLimit: 3, // 控制文件上传并发数
	ChunkParallelLimit: 3, // 控制单个文件下分片上传并发数
	ChunkSize: 1024 * 1024, // 控制分片大小，单位 B
});

var poolConfig = mysql.createPool({
	host: CONFIG.DBPRODUCT.HOST,
	user: CONFIG.DBPRODUCT.USER,
	password: CONFIG.DBPRODUCT.PASSWORD,
	database: CONFIG.DBPRODUCT.DATABASE,
	port: CONFIG.DBPRODUCT.PORT
});
var poolConfigLog = mysql.createPool({
	host: CONFIG.DBLOG.HOST,
	user: CONFIG.DBLOG.USER,
	password: CONFIG.DBLOG.PASSWORD,
	database: CONFIG.DBLOG.DATABASE,
	port: CONFIG.DBLOG.PORT
});

var selectSQL = "show variables like 'wait_timeout'";

poolConfig.getConnection(function(err, conn) {
	if (err) console.log("POOL ==> " + err);

	function query() {
		conn.query(selectSQL, function(err, res) {
			console.log(new Date());
			console.log(res);
			console.log(' db pool ready .');
			conn.release();
		});
	}
	query();
	// setInterval(query, 5000);
});
var tokenWechat = require('./tokenWechat.js');
var wechatToken = tokenWechat();
var cacheTemplate = require('./cacheTemplate.js');
cacheTemplate();
var qcodeHtml = '<img src="' + CONFIG.QCLOUD_PARA.BUCKET_DOMAIN + 'public/qrcode_for_gh_169d147a5ce3_129.jpg"><br/>长按二维码关注“读书接龙”，开始记录阅读'

// function goMy(a) {};
// goMy(tokenWechat(poolConfig));
if (CONFIG.REDIS_SESSION) {
	app.use(session({
		store: new RedisStore({
			host: "127.0.0.1",
			port: 6379,
			ttl: 1800 // 过期时间
		}),
		secret: 'keyboard',
		rolling: true,
		cookie: {
			maxAge: 30 * 60000
		}
	}))
} else {
	app.use(session({
		secret: 'keyboard',
		rolling: true,
		resave: true,
		saveUninitialized: true,
		cookie: {
			maxAge: 30 * 60000
		}
	}))
}


//过滤器页面检查，HEADER检查，code参数检查，session参数检查
app.use(function(req, res, next) {
	var isNext = true;
	var ctimeSecond = new Date().getTime() / 1000
	if (req.url.indexOf('\/page\/') != -1 && req.url.indexOf('.js') == -1 && req.url.indexOf('.css') == -1) {
		if (checkWechatHeader()) {
			if (req.query.code) {
				isNext = false
				oAuthBaseProcess(req.query.code, 'mp')
			} else {
				if (!req.session.wechatBase) {
					// only support get method
					// var scope = 'snsapi_userinfo';
					var scope = 'snsapi_base';
					var urlEncodedUrl = encodeURIComponent(req.protocol + '://' + req.hostname + req.url)
					var oAuthUrl = 'https://open.weixin.qq.com/connect/oauth2/authorize?appid=' + CONFIG.WECHAT.APPID + '&redirect_uri=' + urlEncodedUrl + '&response_type=code&scope=' + scope + '&state=123#wechat_redirect'
					isNext = false
					return res.send('<script>location="' + oAuthUrl + '"</script>')
				} else {
					if (!req.query.f) {
						isNext = false
						return redirectAfterOAuthSuccess()
					}
				}
			}
		} else {
			isNext = false
			return res.send(globalInfo.cacheTemplate['wechatOnly.htm'].content)
		}
	} else if (req.url.indexOf('\/ajax\/') != -1) {
		if (!req.session.wechatBase) {
			isNext = false
			res.send('{"status":"error","msg":"no certificate"}')
			return res.end()
		}
	} else if (req.url.indexOf('\/pageWeb\/') != -1 && req.url.indexOf('.js') == -1 && req.url.indexOf('.css') == -1) {
		if (req.query.code) {
			isNext = false
			oAuthBaseProcess(req.query.code, 'open')
		} else {
			if (!req.session.wechatBase) {
				// only support get method
				// var scope = 'snsapi_userinfo';
				var urlEncodedUrl = encodeURIComponent(req.protocol + '://' + req.hostname + req.url)
				var oAuthUrl = 'https://open.weixin.qq.com/connect/qrconnect?appid=' + CONFIG.WECHAT_OPEN.APPID + '&redirect_uri=' + urlEncodedUrl + '&response_type=code&scope=snsapi_login&state=123#wechat_redirect'
				isNext = false
				return res.send('<script>location="' + oAuthUrl + '"</script>')
			} else {
				if (!req.query.f) {
					isNext = false
					return redirectAfterOAuthSuccess()
				}
			}
		}
	} else if (req.url.indexOf('\/ajaxWeb\/') != -1) {
		if (!req.session.wechatBase) {
			isNext = false
			res.send('{"status":"error","msg":"no certificate"}')
			return res.end()
		}
	}
	if (isNext) {
		next();
	}

	function checkWechatHeader() {
		if (req.header('User-Agent').toLowerCase().indexOf('micromessenger') != -1) {
			return true
		} else {
			return false
		}
	};

	function oAuthBaseProcess(code, stage) {
		var https = require('https');
		var appId = CONFIG.WECHAT.APPID;
		var url = 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=' + CONFIG.WECHAT.APPID + '&secret=' + CONFIG.WECHAT.SECRET + '&code=' + code + '&grant_type=authorization_code'
		if (stage == 'open') {
			var url = 'https://api.weixin.qq.com/sns/oauth2/access_token?appid=' + CONFIG.WECHAT_OPEN.APPID + '&secret=' + CONFIG.WECHAT_OPEN.SECRET + '&code=' + code + '&grant_type=authorization_code'
			appId = CONFIG.WECHAT_OPEN.APPID;
		}
		https.get(url, function(response) {
			var body = '';
			response.on('data', function(d) {
				body += d;
			});
			response.on('end', function() {
				var rev = JSON.parse(body);
				logger.debug(rev);
				if (rev.openid) {
					// async update user info to db
					insertOrUpdateWechatUser(rev, appId);
					// can trace f parameter (from openid) here , and replace it here if you need .
					req.session.wechatBase = rev
					if (rev.scope == 'snsapi_userinfo' || rev.scope == 'snsapi_login') {
						oAuthUserInfo();
					} else {
						redirectAfterOAuthSuccess();
					}
				} else {
					logger.error(req.originalUrl)
					logger.error('oAuthBaseProcess can not get openid from wechat')
					return res.send(globalInfo.cacheTemplate['error.htm'].content)
				}
			});
		});
	};

	function insertOrUpdateWechatUser(wechatBase, appId) {
		poolConfig.query("SELECT ifnull(lastFetchInfoFromWechat,0) as lastFetchInfoFromWechat,ifnull(subscribeTime,0) as subscribeTime FROM tbl_wechat_users where openId=?", [wechatBase.openid], function(err, rowRs, fields) {
			if (err) {
				logger.error(err)
			} else {
				if (rowRs.length > 0) {
					req.session.userInfoFromDb = rowRs[0];
					//if no response any more . need save .
					req.session.save(null)
					poolConfig.query("update tbl_wechat_users set lastLoginTime=? where openId=?  ", [ctimeSecond, wechatBase.openid], function(err, rows, fields) {
						if (err) {
							logger.error(err)
						} else {
							if (!rows.constructor.name == 'OkPacket') {
								logger.error('update tbl_wechat_users set lastLoginTime:')
								logger.error(rows)
							}
						}
					})
					if (rowRs[0].lastFetchInfoFromWechat == 0 || ctimeSecond - rowRs[0].lastFetchInfoFromWechat > 86400) {
						getUserInfoWithOpenId(wechatBase.openid)
					}
				} else {
					poolConfig.query("insert into tbl_wechat_users (openId,createTime,lastLoginTime,unionId,appId) values (?,?,?,?,?)  ", [wechatBase.openid, ctimeSecond, ctimeSecond, wechatBase.unionid, appId], function(err, rows, fields) {
						if (err) {
							logger.error(err)
						} else {
							if (!rows.constructor.name == 'OkPacket') {
								logger.error('insert into tbl_wechat_users:')
								logger.error(rows)
							} else {
								getUserInfoWithOpenId(wechatBase.openid)
							}
						}
					})
				}
			}
		});
	}

	function getUserInfoWithOpenId(openId) {
		var https = require('https');
		var url = 'https://api.weixin.qq.com/cgi-bin/user/info?access_token=' + globalInfo.token.value + '&openid=' + openId + '&lang=zh_CN'
		https.get(url, function(response) {
			var body = '';
			response.on('data', function(d) {
				body += d;
			});
			response.on('end', function() {
				var rev = JSON.parse(body);
				if (rev.subscribe_time) {
					req.session.userInfoFromDb = {
						subscribeTime: rev.subscribe_time,

					}
					req.session.save(null)
					poolConfig.query("update tbl_wechat_users set lastFetchInfoFromWechat=?,nickName=?,headImgUrl=?,subscribeTime=? where openId=?  ", [ctimeSecond, rev.nickname, rev.headimgurl, rev.subscribe_time, openId], function(err, rows, fields) {
						if (err) {
							logger.error(err)
						} else {
							if (!rows.constructor.name == 'OkPacket') {
								logger.error('update tbl_wechat_users set getUserInfoWithOpenId:')
								logger.error(rows)
							}
						}
					})
				} else if (rev.subscribe == 0) {
					req.session.userInfoFromDb = {
						subscribeTime: 0,
					}
					req.session.save(null)
					poolConfig.query("update tbl_wechat_users set lastFetchInfoFromWechat=?,subscribeTime=? where openId=?  ", [ctimeSecond, 0, openId], function(err, rows, fields) {
						if (err) {
							logger.error(err)
						} else {
							if (!rows.constructor.name == 'OkPacket') {
								logger.error('update tbl_wechat_users set getUserInfoWithOpenId:')
								logger.error(rows)
							}
						}
					})
				} else {
					logger.error(body);
					logger.error(rev);
					logger.error(url)
					logger.error('getUserInfoWithOpenId can not get userinfo from wechat')
				}
			});
		});
	}

	function oAuthUserInfo(code) {
		var https = require('https');
		var url = 'https://api.weixin.qq.com/sns/userinfo?access_token=' + req.session.wechatBase.access_token + '&openid=' + req.session.wechatBase.openid + '&lang=zh_CN'
		https.get(url, function(response) {
			var body = '';
			response.on('data', function(d) {
				body += d;
			});
			response.on('end', function() {
				var rev = JSON.parse(body);
				logger.debug("oAuthUserInfo");
				logger.debug(rev);
				if (rev.openid) {
					req.session.wechatUserInfo = rev
					redirectAfterOAuthSuccess();
				} else {
					logger.error(url)
					logger.error('oAuthUserInfo can not get userinfo from wechat')
					return res.send(globalInfo.cacheTemplate['error.htm'].content)
				}
			});
		});
	};

	function redirectAfterOAuthSuccess() {
		var target = pu.cleanedUrl(req)
		if (target.indexOf('f=') == -1) {
			if (target.indexOf('?') == -1) {
				target += '?f=' + req.session.wechatBase.openid
			} else {
				target += '&f=' + req.session.wechatBase.openid
			}
		}
		return res.send('<script>location="' + target + '"</script>')
			// return res.redirect(target);
	}
})



function index(req, res) {
	res.send('Hello World!');
}

function profile(req, res) {
	poolConfig.query("SELECT *,ifnull(memberExpireTime,0) as memberExpireTime,ifnull(currentCapacity,0) as currentCapacity FROM tbl_wechat_users where openId=?", [req.session.wechatBase.openid], function(err, rows, fields) {
		if (err) {
			logger.error(err)
		} else {
			if (rows.length > 0) {
				var ctime = new Date()
				var renderDict = {}
				renderDict['{{currentCapacity}}'] = '' + rows[0].currentCapacity / 1000000 + ' M'
				if (rows[0].memberExpireTime > ctime.getTime() / 1000) {
					renderDict['{{limitCapacity}}'] = '' + (rows[0].baseCapacity / 1000000 + 1000) + ' M'
					renderDict['{{memberType}}'] = '付费-增加1000M空间'
					renderDict['{{memberExpireTime}}'] = '有效期至：' + new Date(rows[0].memberExpireTime * 1000).toLocaleDateString()
					renderDict['{{buttonCharge}}'] = '续费付费会员68元/年'
				} else {
					renderDict['{{limitCapacity}}'] = '' + rows[0].baseCapacity / 1000000 + ' M <span style="color: red">(付费会员可增加1000M空间)</span>'
					renderDict['{{memberType}}'] = '免费'
					renderDict['{{memberExpireTime}}'] = ''
					renderDict['{{buttonCharge}}'] = '升级付费会员68元/年'
				}
				res.send(pu.renderHtml(globalInfo.cacheTemplate['profile.htm'].content, renderDict))
			}
		}
	})
}

var authReadButton = '<a href="javascript:showShareTip();" class="weui-btn weui-btn_primary">分享</a><div class="weui-cells__tips"></div><a href="javascript:;" class="weui-btn weui-btn_primary" id="chooseImageNote">增加读书笔记</a>'

function bookViewHtml(row) {
	return '<div class="weui-cell"><div class = "weui-cell__hd" style = "position: relative;margin-right: 10px;" ><img src = "' + CONFIG.QCLOUD_PARA.THUMBNAILS_DOMAIN + row.cover + '?imageView2/2/w/50"  style = "width: 50px;display: block" /></div><div class = "weui-cell__bd"><p style = "color: #000000;">' + row.bookName + '</p><p style = "font-size: 13px;color: #888888;">' + (row.author.length > 0 ? (' 作者：' + row.author + ' ') : '') + (row.translator.length > 0 ? (' 译者：' + row.translator + ' ') : '') + '</p></div></div>'
}

function read(req, res) {
	if (req.query.id) {
		// res.setHeader("Cache-Control", "no-cache,no-store,must-revalidate");
		// res.setHeader("Pragma", "no-cache");
		// res.setHeader("Expires", 0);
		var renderDict = {}
		poolConfig.query("SELECT *,IFNULL(bookName,'') AS bookName,IFNULL(note,'') AS note,cover,IFNULL(author,'') AS author,IFNULL(translator,'') AS translator ,tbl_notes.id as noteId,tbl_reads.openId,bookId,ifnull(tbl_wechat_users.nickName,'') as nickName FROM  `tbl_notes`,`tbl_reads`, `tbl_books`,tbl_wechat_users  WHERE tbl_books.id = tbl_reads.bookId AND tbl_notes.readId=tbl_reads.id AND tbl_wechat_users.openId=tbl_reads.openid AND tbl_reads.id = ? order by tbl_notes.id desc ", [req.query.id], function(err, rows, fields) {
			if (err) {
				logger.error(err)
			} else {
				var button = ''
				if (req.session.userInfoFromDb && req.session.userInfoFromDb.subscribeTime == 0) {
					// button = '<a href="javascript:"><a href="https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=MzA5OTQ5Mjg4MA==&scene=110#wechat_redirect" class="weui-btn weui-btn_primary">关注读书接龙，记录读书笔记</a></a>'
					button = qcodeHtml
				}
				if (rows.length > 0) {
					var row = rows[0]
					var bookHtml = bookViewHtml(row)
					if (req.session.wechatBase.openid == row.openId) {
						bookHtml = '<a href="editBook?id=' + row.bookId + '">' + bookHtml + '</a>'
						button = authReadButton
					}
					var notesHtml = ''
					var notesPicScript = ''
					rows.forEach(function(row) {
						var d = new Date(row.noteId / 1000000)
						var noteCell = '<div class="weui-media-box weui-media-box_text"><h4 class="weui-media-box__title">' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString() + '</h4><p class="weui-media-box__desc">' + row.note + '</p></div><div class="weui-panel__ft" id="' + row.noteId + '"><a href="javascript:void(0);" class="weui-cell weui-cell_access weui-cell_link"><div class="weui-cell__bd">查看照片(' + row.pics.split(',').length + ')</div><span class="weui-cell__ft"></span></a></div>'
							// if (req.session.wechatBase.openid == row.openId) {
						noteCell = '<a href="editNote?id=' + row.noteId + '">' + noteCell + '</a>'
							// }
						notesHtml += noteCell
						notesPicScript += 'pics["' + row.noteId + '"]="' + row.pics + '";'
					})
					renderDict['{{button}}'] = button
					renderDict['{{imgUrl}}'] = CONFIG.QCLOUD_PARA.THUMBNAILS_DOMAIN + row.cover + '?imageView2/1/w/50'
					renderDict['{{title}}'] = row.bookName + '-' + row.nickName + '的读书笔记'
					renderDict['{{book}}'] = bookHtml
					renderDict['{{scriptPicData}}'] = '<script>picDomain="' + CONFIG.QCLOUD_PARA.BUCKET_DOMAIN + '";var pics={};' + notesPicScript + '</script>'
					renderDict['{{notes}}'] = notesHtml
					res.send(pu.renderHtml(globalInfo.cacheTemplate['read.htm'].content, renderDict))
				} else {
					poolConfig.query("SELECT *,IFNULL(bookName,'') AS bookName,cover,IFNULL(author,'') AS author,IFNULL(translator,'') AS translator ,tbl_reads.openId,bookId,ifnull(tbl_wechat_users.nickName,'') as nickName  FROM  `tbl_reads`, `tbl_books`,tbl_wechat_users  WHERE tbl_books.id = tbl_reads.bookId AND tbl_wechat_users.openId=tbl_reads.openid AND tbl_reads.id = ?  ", [req.query.id], function(err, rows, fields) {
						if (rows.length > 0) {
							var row = rows[0]
							var bookHtml = bookViewHtml(row)
							if (req.session.wechatBase.openid == row.openId) {
								bookHtml = '<a href="editBook?id=' + row.bookId + '">' + bookHtml + '</a>'
								button = authReadButton
							}
							var notesHtml = ''
							var notesPicScript = ''
							renderDict['{{button}}'] = button
							renderDict['{{imgUrl}}'] = CONFIG.QCLOUD_PARA.THUMBNAILS_DOMAIN + row.cover + '?imageView2/1/w/50'
							renderDict['{{title}}'] = row.bookName + '-' + row.nickName + '的读书笔记'
							renderDict['{{book}}'] = bookHtml
							renderDict['{{scriptPicData}}'] = '<script>picDomain="' + CONFIG.QCLOUD_PARA.BUCKET_DOMAIN + '";var pics={};' + notesPicScript + '</script>'
							renderDict['{{notes}}'] = notesHtml
							res.send(pu.renderHtml(globalInfo.cacheTemplate['read.htm'].content, renderDict))
						} else {
							logger.warn(' read is not exist . ' + req.url)
							return fail()
						}
					})
				}
			}
		});
	} else {
		logger.warn('id not exist . ' + req.url)
		return fail()
	}

	function fail() {
		return res.send(globalInfo.cacheTemplate['error.htm'].content)
	}
}

function editOrderByCustomer(req, res) {
	if (req.query.id) {
		checkOrderCustomerAuthorize(req, res, req.query.id, ' editOrderByCustomer order id ', succ, fail)
	} else {
		logger.warn('id not exist . ' + req.url)
		return fail()
	}

	function succ(rows, pageFile) {
		var renderDict = {
			"{{originPic}}": CONFIG.QCLOUD_PARA.THUMBNAILS_DOMAIN + rows[0].originPic,
			"{{textContent}}": rows[0].textContent && rows[0].textContent != 'null' ? rows[0].textContent : '',
			"{{tailorNickName}}": rows[0].tailorNickName && rows[0].tailorNickName != 'null' ? rows[0].tailorNickName : '',
			"{{tailorReceiver}}": rows[0].tailorReceiver && rows[0].tailorReceiver != 'null' ? rows[0].tailorReceiver : '',
			"{{tailorMobile}}": rows[0].tailorMobile && rows[0].tailorMobile != 'null' ? rows[0].tailorMobile : '',
			"{{tailorAddress}}": rows[0].tailorAddress && rows[0].tailorAddress != 'null' ? rows[0].tailorAddress : '',
			"{{tailorPostcode}}": rows[0].tailorPostcode && rows[0].tailorPostcode != 'null' ? rows[0].tailorPostcode : '',
			"{{orderPrice}}": rows[0].orderPrice && rows[0].orderPrice != 'null' ? rows[0].orderPrice : 0,
		};
		return res.send(pu.renderHtml(globalInfo.cacheTemplate[pageFile].content, renderDict))
	}

	function fail() {
		return res.send(globalInfo.cacheTemplate['error.htm'].content)
	}
}



function checkOrderCustomerAuthorize(req, res, id, tag, success, fail) {
	poolConfig.query("SELECT * FROM `orders`,tailors  WHERE orders.id = ? and orders.tailorUnionId=tailors.unionId  ", [id], function(err, rows, fields) {
		if (err) {
			logger.error(err)
		} else {
			if (rows.length > 0) {
				if (rows[0].customerOpenId == req.session.wechatBase.openid) {
					return success(rows, 'editOrderByCustomer.htm')
				} else {
					return success(rows, 'viewOrder.htm')
				}
			} else {
				logger.warn(tag + ' is not exist . ' + req.url)
				return fail()
			}
		}
	});
}


function checkEditAuthorize(req, res, tag, success, fail) {
	var sql = ''
	switch (req.body.table) {
		case "orderByCustomer":
			sql = "SELECT * FROM `orders`  WHERE id = ?"
			break;
		default:
			// ...
	}
	if (sql != '') {
		poolConfig.query(sql, [req.body.id], function(err, rows, fields) {
			if (err) {
				logger.error(err)
			} else {
				if (rows.length > 0) {
					if (rows[0].customerOpenId == req.session.wechatBase.openid) {
						return success(rows)
					} else {
						return fail()
					}
				} else {
					logger.warn(tag + ' is not exist . ' + req.url)
					return fail()
				}
			}
		});
	} else {
		return fail()
	}
}

function editValueAjax(req, res) {
	if (!req.body) return res.sendStatus(400)
	if (req.body.id) {
		checkEditAuthorize(req, res, ' editValueAjax ajax ', succ, fail)
	} else {
		logger.warn(' id not exist . ' + req.url + req.body)
		return fail()
	}

	function succ(rows) {
		if (!req.session.modifyTag) {
			req.session.modifyTag = req.body.modifyTag - 1
		}
		if (req.body.modifyTag > req.session.modifyTag) {
			poolConfig.query("UPDATE orders SET textContent=?,lastModifyTime=? WHERE id = ? ", [req.body.value, new Date().getTime() / 1000, req.body.id], function(err, rows, fields) {
				if (err) {
					logger.error(err)
				} else {
					if (!(rows.constructor.name == 'OkPacket')) {
						logger.error('error editBookAjax update sql:')
						logger.error(rows)
						return fail()
					} else {
						req.session.modifyTag = req.body.modifyTag
						res.send('{"status":"ok","modifyTag":"' + req.body.modifyTag + '"}')
						return res.end()
					}
				}
			});
		} else {
			logger.warn(' modifyTag lt session')
			return fail()
		}
	}

	function fail() {
		return res.send('{"status":"error"}')
	}
}

function editTailorAjax(req, res) {
	var tag = "editTailorAjax"
	var item = ""
	if (!req.body) return res.sendStatus(400)
	logger.debug(tag)
	checkItem()
	var currentTime = new Date().getTime() / 1000

	function checkItem() {
		if (',machineModel,mobile,price,wechatId,address,postcode,tailorNickName,bank,bankAccount,'.indexOf(',' + req.body.item + ',') != -1) {
			checkTailor()
		} else {
			fail();
		}
	}


	function checkTailor() {
		poolConfig.query("select * from tailors WHERE unionId = ? ", [req.session.wechatBase.unionid], function(err, rows, fields) {
			if (rows.length > 0) {
				update()
			} else {
				insert()
			}
		})
	}


	function update() {
		if (!req.session.modifyTag) {
			req.session.modifyTag = req.body.modifyTag - 1
		}
		if (req.body.modifyTag > req.session.modifyTag) {
			poolConfig.query('UPDATE tailors  SET ' + req.body.item + '=?,lastModifyTime=? WHERE unionId = ? ', [req.body.value, currentTime, req.session.wechatBase.unionid], function(err, rows, fields) {
				if (err) {
					logger.error(err)
					return fail()
				} else {
					if (!(rows.constructor.name == 'OkPacket')) {
						logger.error('error ' + tag + ' update sql:')
						logger.error(rows)
						return fail()
					} else {
						req.session.modifyTag = req.body.modifyTag
						res.send('{"status":"ok","modifyTag":"' + req.body.modifyTag + '"}')
						return res.end()
					}
				}
			});
		} else {
			logger.warn(' modifyTag lt session')
			return fail()
		}
	}

	function insert() {
		if (!req.session.modifyTag) {
			req.session.modifyTag = req.body.modifyTag - 1
		}
		if (req.body.modifyTag > req.session.modifyTag) {
			poolConfig.query("insert tailors (" + req.body.item + ",openId,createTime,lastModifyTime,unionId) values (?,?,?,?,?)", [req.body.value, req.session.wechatBase.openid, currentTime, currentTime, req.session.wechatBase.unionid], function(err, rows, fields) {
				if (err) {
					logger.error(err)
				} else {
					if (!(rows.constructor.name == 'OkPacket')) {
						logger.error('error ' + tag + ' update sql:')
						logger.error(rows)
						return fail()
					} else {
						req.session.modifyTag = req.body.modifyTag
						res.send('{"status":"ok","modifyTag":"' + req.body.modifyTag + '"}')
						return res.end()
					}
				}
			});
		} else {
			logger.warn(' modifyTag lt session')
			return fail()
		}
	}

	function fail() {
		return res.send('{"status":"error"}')
	}
}

function actLogAjax(req, res) {
	res.send('{"msg":"ok"}')
	res.end()
	poolConfigLog.query("insert log_async_generals (id,logId,para01,para02,para03,para04) values(?,?,?,?,?,?)", [new Date().getTime() * 1000000 + CONFIG.SERVER_ID * 10000 + 10000 * Math.random(),
		1, req.session.wechatBase.openid, req.body.act, req.body.result, req.body.location
	], function(err, rows, fields) {
		if (err) {
			logger.error(err)
		} else {
			if (!(rows.constructor.name == 'OkPacket')) {
				logger.error('error actLogAjax sql:')
				logger.error(rows)
			}
		}
	});
}

function listOrderByCustomerAjax(req, res) {
	poolConfig.query("SELECT * FROM  orders WHERE customerOpenId =? order by lastModifyTime desc", [req.session.wechatBase.openid], function(err, rows, fields) {
		if (err) {
			logger.error(err)
		} else {
			var result = {
				rows: [],
			}
			rows.forEach(function(row) {
				var cell = {
					originPic: CONFIG.QCLOUD_PARA.THUMBNAILS_DOMAIN + row.originPic,
					textContent: row.textContent && row.textContent != 'null' ? row.textContent : '',
					id: row.id,
				}
				result.rows.push(cell)
			});
			res.send(JSON.stringify(result))
			res.end()
		}
	});
}

function getTailorInfoByUnionIdAjax(req, res) {
	poolConfig.query("SELECT * FROM  tailors,tbl_wechat_users WHERE tailors.unionId =?  and tailors.unionId=tbl_wechat_users.unionid and appId=?", [req.query.tailorUnionId, CONFIG.WECHAT.APPID], function(err, rows, fields) {
		if (err) {
			logger.error(err)
		} else {
			res.send(JSON.stringify(rows))
			res.end()
		}
	});
}

function tailorAjax(req, res) {
	poolConfig.query("SELECT * FROM  tailors WHERE openId =?", [req.session.wechatBase.openid], function(err, rows, fields) {
		if (err) {
			logger.error(err)
		} else {
			if (rows.length > 0 && rows[0].machinePic) {
				rows[0].machinePic = CONFIG.QCLOUD_PARA.THUMBNAILS_DOMAIN + rows[0].machinePic
			}
			res.send(JSON.stringify(rows))
			res.end()
		}
	});
}

var WXPay = require('weixin-pay');

function createUnifiedOrderAjax(req, res) {
	var wxpay = WXPay({
		appid: CONFIG.WECHAT.APPID,
		mch_id: CONFIG.WXPAY.MCH_ID,
		partner_key: CONFIG.WXPAY.PARTNER_KEY, //微信商户平台API密钥
		// pfx: fs.readFileSync('./wxpay_cert.p12'), //微信商户平台证书
	});

	var ctime = new Date()
	var para = {
		body: '服务费',
		out_trade_no: '' + ctime.getFullYear() + '-' + (ctime.getMonth() + 1) + '-' + ctime.getDate() + '-' + ctime.getHours() + '-' + ctime.getMinutes() + '-' + ctime.getSeconds() + '-' + Math.random().toString().substr(2, 10) + '-' + req.query.orderId,
		total_fee: CONFIG.MEMBER_FEE,
		spbill_create_ip: '127.0.0.1',
		notify_url: 'http://' + CONFIG.DOMAIN + '/' + CONFIG.PAY_DIR_FIRST + '/notify',
		trade_type: 'JSAPI',
		product_id: req.query.orderId,
		openid: req.session.wechatBase.openid,
	}
	wxpay.createUnifiedOrder(para, function(err, result) {
		logger.debug('createUnifiedOrder:')
		logger.debug(para)
		logger.debug(err)
		logger.debug(result)
		var reqparam = {
			appId: CONFIG.WECHAT.APPID,
			timeStamp: parseInt(new Date().getTime() / 1000) + "",
			nonceStr: result.nonce_str,
			package: "prepay_id=" + result.prepay_id,
			signType: "MD5",
		};
		reqparam.paySign = wxpay.sign(reqparam);
		reqparam.timestamp = reqparam.timeStamp;
		delete reqparam.timeStamp
		res.send(JSON.stringify(reqparam))
		res.end()
	});
}

function editBookAjax(req, res) {
	if (!req.body) return res.sendStatus(400)
	if (req.body.id) {
		checkOrderCustomerAuthorize(req, res, req.body.id, ' editBook ajax ', succ, fail)
	} else {
		logger.warn(' id not exist . ' + req.url + req.body)
		return fail()
	}

	function succ(rows) {
		if (rows[0].bookName != req.body.bookName || rows[0].author != req.body.author || rows[0].translator != req.body.translator) {
			poolConfig.query("update tbl_books set bookName=?,author=?,translator=?,lastModifyOpenId=?,lastModifyTime=? where id=?", [req.body.bookName, req.body.author, req.body.translator, req.session.wechatBase.openid, new Date().getTime() / 1000, req.body.id], function(err, rows, fields) {
				if (err) {
					logger.error(err)
				} else {
					if (!(rows.constructor.name == 'OkPacket')) {
						logger.error('error editBookAjax update sql:')
						logger.error(rows)
					}
				}
			});
		} else {
			logger.debug(' editBookAjax no change')
		}
		res.send('{"status":"ok"}')
		return res.end()
	}

	function fail() {
		res.send('{"status":"error"}')
		return res.end()
	}
}

function signOut(req, res) {
	var result = 'var sign = ' + JSON.stringify(sign(globalInfo.jsapiTicket.value, req.header('Referer'))) + ';';
	result += 'var unionid = ' + JSON.stringify(req.session.wechatBase.unionid) + ';';
	res.send(result);
}

function sessionTest(req, res) {
	var sess = req.session
	if (sess.count) {
		sess.count++;
	} else {
		sess.count = 1;
	}
	console.log(sess.count)
	res.send('<script src="js/jquery-3.2.1.min.js"></script><script>$.get("sessionTest", function(result){console.log(result);});</script>');
	res.end()
}

function picUploadAjax(req, res) {
	if (!req.body) return res.sendStatus(400)
		//todo check readId
	var successUploadCount = 0
	var successUploadBytes = 0
	var ctime = new Date()
	for (var i = 0; i < req.body.serverId.length; i++) {
		downloadWechatPicMedia(req.body.serverId[i]);
	}
	var keyNames = []

	function downloadWechatPicMedia(mediaId) {
		var https = require('https');
		var url = 'https://api.weixin.qq.com/cgi-bin/media/get?access_token=' + globalInfo.token.value + '&media_id=' + mediaId
		https.get(url, function(response) {
			response.setEncoding("binary");
			var body = '';
			response.on('data', function(d) {
				body += d;
			});
			response.on('end', function() {
				var tmpFileName = "./tmp/" + mediaId + ".jpg"
				fs.writeFile(tmpFileName, body, "binary", function(err) {
					if (err) {
						logger.error(url);
						logger.error("down fail");
						return
					}
					//todo md5相关验证和碰撞处理

					// 分片上传
					var keyFileNameWithTime = req.query.act + '/' + ctime.getFullYear() + '/' + (ctime.getMonth() + 1) + '/' + ctime.getDate() + '/' + req.session.wechatBase.openid + '-' + mediaId + '.jpg'
					cos.sliceUploadFile({
						Bucket: CONFIG.QCLOUD_PARA.COS.Bucket,
						Region: CONFIG.QCLOUD_PARA.COS.Region,
						Key: keyFileNameWithTime,
						FilePath: tmpFileName
					}, function(err, data) {
						logger.debug(err || data)
						if (err) {
							logger.error(err, data);
						} else {
							//delete tmp file
							fs.unlink(tmpFileName, (err) => {
								if (err) {
									logger.error(err);
								}
								successUploadCount++
								successUploadBytes += body.length
								keyNames.push(keyFileNameWithTime)
								if (successUploadCount == req.body.serverId.length) {
									processCmd()
								}
							});
						}
					});
				});
			});
		});
	};

	function processCmd() {
		switch (req.query.act) {
			case "customerUploadOriginPic":
				customerUploadOriginPic();
				break;
			case "tailorMachinePic":
				tailorMachinePic();
				break;
			default:
				// ...
		}
	}

	function tailorMachinePic() {
		var currentTime = ctime.getTime() / 1000
		poolConfig.query("select machinePic from tailors where openid=?", [req.session.wechatBase.openid], function(err, rows, fields) {
			if (err) {
				logger.error(err)
			} else {
				if (rows.length > 0) {
					poolConfig.query("update tailors set machinePic=?,lastModifyTime=? where openid=?", [keyNames[0], currentTime, req.session.wechatBase.openid], function(err, result, fields) {
						if (result.constructor.name == 'OkPacket') {
							var sendContent = '{"status":"ok","picUrl":"' + CONFIG.QCLOUD_PARA.THUMBNAILS_DOMAIN + keyNames[0] + '"}'
							logger.debug(sendContent)
							res.send(sendContent);
							res.end()
							if (rows[0].machinePic) {
								cos.deleteObject({
									Bucket: CONFIG.QCLOUD_PARA.COS.Bucket,
									Region: CONFIG.QCLOUD_PARA.COS.Region,
									Key: rows[0].machinePic,
								}, function(err, data) {
									if (err) {
										return logger.error(err);
									}
									logger.debug(JSON.stringify(data, null, '  '));
								});
							}
						} else {
							logger.error('error tailorMachinePic:')
							logger.error(result)
						}
					})
				} else {
					poolConfig.query("insert tailors (machinePic,openId,createTime,lastModifyTime,unionId) values (?,?,?,?,?)", [keyNames[0], req.session.wechatBase.openid, currentTime, currentTime, req.session.wechatBase.unionid], function(err, result, fields) {
						if (result.constructor.name == 'OkPacket') {
							var sendContent = '{"status":"ok","picUrl":"' + CONFIG.QCLOUD_PARA.THUMBNAILS_DOMAIN + keyNames[0] + '"}'
							logger.debug(sendContent)
							res.send(sendContent);
							res.end()
						} else {
							logger.error('error tailorMachinePic:')
							logger.error(result)
						}
					})
				}
			}
		});
	};

	function customerUploadOriginPic() {
		var createTime = ctime.getTime() / 1000
		poolConfig.query("insert orders (createTime,lastModifyTime,originPic,customerOpenId,tailorUnionId,orderPrice,tailorMobile,tailorAddress,tailorPostcode,tailorReceiver) select ?,?,?,?,unionid,price,mobile,address,postcode,realName from tailors where unionid=? ", [createTime, createTime, keyNames[0], req.session.wechatBase.openid, req.query.tailorUnionId], function(err, rows, fields) {
			if (err) {
				logger.error(err)
			} else {
				if (rows.constructor.name == 'OkPacket') {
					var sendContent = '{"status":"ok","location":"editOrderByCustomer?id=' + rows.insertId + '"}'
					logger.debug('customerUploadOriginPic complete:' + sendContent)
					res.send(sendContent);
					res.end()
				} else {
					logger.error('error customerUploadOriginPic books table:')
					logger.error(rows)
				}
			}
		});
	};

	function addCapacityUsed() {
		poolConfig.query("update tbl_wechat_users set currentCapacity=ifnull(currentCapacity,0)+? where openId=?", [successUploadBytes, req.session.wechatBase.openid], function(err, rows, fields) {
			if (err) {
				logger.error(rows)
			} else {
				if (rows.constructor.name != 'OkPacket') {
					logger.error('error update tbl_wechat_users set currentCapacity:')
					logger.error(rows)
				}
			}
		});
	}
}

function entanceTailor(req, res) {
	logger.debug(req.session)
}

app.use(express.static(path.join(__dirname, 'static')));

app.get(CONFIG.DIR_FIRST + '/', index);
app.get(CONFIG.DIR_FIRST + '/page/signWechat.js', signOut);
app.get(CONFIG.DIR_FIRST + '/page/editOrderByCustomer', editOrderByCustomer);
app.get(CONFIG.DIR_FIRST + '/page/entanceTailor', entanceTailor);
// app.get('/node/sessionTest', sessionTest);
app.post(CONFIG.DIR_FIRST + '/ajax/picUploadAjax', jsonParser, picUploadAjax);
app.post(CONFIG.DIR_FIRST + '/ajax/editValueAjax', jsonParser, editValueAjax);
app.post(CONFIG.DIR_FIRST + '/ajax/editTailorAjax', jsonParser, editTailorAjax);
app.get(CONFIG.DIR_FIRST + '/ajax/listOrderByCustomerAjax', listOrderByCustomerAjax);
app.get(CONFIG.DIR_FIRST + '/ajax/getTailorInfoByUnionIdAjax', getTailorInfoByUnionIdAjax);
app.get(CONFIG.DIR_FIRST + '/ajax/tailorAjax', tailorAjax);
app.get(CONFIG.DIR_FIRST + '/ajax/createUnifiedOrderAjax', createUnifiedOrderAjax);

// console.log(sign(poolConfig, 'http://example.com'));

var server = app.listen(CONFIG.LISTEN_PORT, function() {
	var host = server.address().address;
	var port = server.address().port;

	console.log('Example app listening at http://%s:%s', host, port);
});