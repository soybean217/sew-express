'use strict';
var express = require('express');
var session = require('express-session');
var RedisStore = require('connect-redis')(session);
var path = require('path');
var sign = require('./sign.js');
var CONFIG = require('./config.js');
var app = express();
var mysql = require('mysql');
var url = require('url');
var fs = require("fs");
var pu = require('./privateUtil.js');
var xml2js = require('xml2js');
var xmlparser = require('express-xml-bodyparser');
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
logger.setLevel(CONFIG.LOG_LEVEL);
// logger.appender.layout.pattern("[%h %x{pid}] - [%d] [%p] %c %m");
var bodyParser = require('body-parser');
var jsonParser = bodyParser.json();
var poolConfig = mysql.createPool({
	host: CONFIG.DBPRODUCT.HOST,
	user: CONFIG.DBPRODUCT.USER,
	password: CONFIG.DBPRODUCT.PASSWORD,
	database: CONFIG.DBPRODUCT.DATABASE,
	port: CONFIG.DBPRODUCT.PORT
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
// tokenWechat.freshToken(poolConfig);

function respRegisterTailor(req, res) {
	var ctimeSecond = new Date().getTime() / 1000
	var resp = ''
	poolConfig.query("SELECT state FROM tailors where openId=?", [req.body.xml.fromusername], function(err, rowRs, fields) {
		if (err) {
			throw err;
		} else {
			if (rowRs.length > 0) {
				if (rowRs[0].state == 'normal') {
					resp = '<xml><ToUserName><![CDATA[' + req.body.xml.fromusername + ']]></ToUserName><FromUserName><![CDATA[' + req.body.xml.tousername + ']]></FromUserName><CreateTime>' + ctimeSecond + '</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[您已经是正式缝纫机主，请在网站登录正常使用]]></Content></xml>'
				} else {
					resp = '<xml><ToUserName><![CDATA[' + req.body.xml.fromusername + ']]></ToUserName><FromUserName><![CDATA[' + req.body.xml.tousername + ']]></FromUserName><CreateTime>' + ctimeSecond + '</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[请修改补充资料继续完成注册' + CONFIG.DOMAIN + CONFIG.DIR_FIRST + '/page/tailor.htm]]></Content></xml>'
				}
			} else {
				resp = '<xml><ToUserName><![CDATA[' + req.body.xml.fromusername + ']]></ToUserName><FromUserName><![CDATA[' + req.body.xml.tousername + ']]></FromUserName><CreateTime>' + ctimeSecond + '</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[请点击链接开始注册' + CONFIG.DOMAIN + CONFIG.DIR_FIRST + '/page/tailor.htm]]></Content></xml>'
			}
		}
		logger.debug('respRegisterTailor', resp)
		res.send(resp)
	});
}

function notify(req, res) {
	// res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
	if (req.body.xml.msgtype == 'event' && req.body.xml.event == 'SCAN' && req.body.xml.eventkey == '123') {
		respRegisterTailor(req, res)
	} else if (req.body.xml.msgtype == 'event' && req.body.xml.event == 'subscribe' && req.body.xml.eventkey == 'qrscene_123') {
		respRegisterTailor(req, res)
	} else {
		res.send('');
	}
	logger.debug(req.body)
		// parser.parseString(req.body, function(err, result) {
		// 	logger.debug(err)
		// 	logger.debug(result)
		// });

}

function notifyGet(req, res) {
	// res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
	res.send(req.query.echostr);
	res.end();
	logger.debug(req.query)
		// parser.parseString(req.body, function(err, result) {
		// 	logger.debug(err)
		// 	logger.debug(result)
		// });

}

function index(req, res) {
	res.send('Hello World!');
}

app.get(CONFIG.INTERFACE_DIR_FIRST + '/', index);
app.post(CONFIG.INTERFACE_DIR_FIRST + '/notify', xmlparser({
	trim: false,
	explicitArray: false
}), notify);
app.get(CONFIG.INTERFACE_DIR_FIRST + '/notify', notifyGet);

var server = app.listen(CONFIG.INTERFACE_LISTEN_PORT, function() {
	var host = server.address().address;
	var port = server.address().port;

	console.log('Example app listening at http://%s:%s', host, port);
});