'use strict';
var express = require('express');
var CONFIG = require('./config.js');
var app = express();
var mysql = require('mysql');
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

function notify(req, res) {
	logger.debug(req.body)
	if (req.body.xml.result_code == 'SUCCESS' && req.body.xml.return_code == 'SUCCESS') {
		var paraArray = req.body.xml.out_trade_no.split('-')
		if (paraArray.length == 8) {
			var orderId = paraArray[7]
			poolConfig.query("update orders set orderState=? where id=?", ['payed', orderId], function(err, rows, fields) {
				if (!rows.constructor.name == 'OkPacket') {
					logger.error('update orders state:')
					logger.error(rows)
				}
			})
		}

	}
	// parser.parseString(req.body, function(err, result) {
	// 	logger.debug(err)
	// 	logger.debug(result)
	// });
	res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
}

function index(req, res) {
	res.send('Hello World!');
}

app.get(CONFIG.PAY_DIR_FIRST + '/', index);
app.post(CONFIG.PAY_DIR_FIRST + '/notify', xmlparser({
	trim: false,
	explicitArray: false
}), notify);

var server = app.listen(CONFIG.PAY_LISTEN_PORT, function() {
	var host = server.address().address;
	var port = server.address().port;

	console.log('Example app listening at http://%s:%s', host, port);
});