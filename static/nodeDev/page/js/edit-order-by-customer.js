/*
 * 注意：
 * 1. 所有的JS接口只能在公众号绑定的域名下调用，公众号开发者需要先登录微信公众平台进入“公众号设置”的“功能设置”里填写“JS接口安全域名”。
 * 2. 如果发现在 Android 不能分享自定义内容，请到官网下载最新的包覆盖安装，Android 自定义分享接口需升级至 6.0.2.58 版本及以上。
 * 3. 完整 JS-SDK 文档地址：http://mp.weixin.qq.com/wiki/7/aaa137b55fb2e0456bf8dd9148dd613f.html
 *
 * 如有问题请通过以下渠道反馈：
 * 邮箱地址：weixin-open@qq.com
 * 邮件主题：【微信JS-SDK反馈】具体问题
 * 邮件内容说明：用简明的语言描述问题所在，并交代清楚遇到该问题的场景，可附上截屏图片，微信团队会尽快处理你的反馈。
 */
var modifyTag = new Date().getTime()
wx.ready(function() {
  wxSdkSuccess();
  // 1 判断当前版本是否支持指定 JS 接口，支持批量判断
  wx.checkJsApi({
    jsApiList: [
      'getNetworkType',
      'previewImage'
    ],
    success: function(res) {}
  });

  getOrderInfo()


  document.querySelector('#chooseWXPay').onclick = function() {
    $.ajax({
      type: 'GET',
      url: "../ajax/createUnifiedOrderAjax?orderId=" + getUrlParam('id'),
      dataType: 'json',
      success: function(data) {
        data.success = function(res) {
          // alert(JSON.stringify(res));
          //{"errMsg":"chooseWXPay:ok"}
          if (res.errMsg == "chooseWXPay:ok") {
            // location.reload(true)
          }
        }
        wx.chooseWXPay(data)
      },
      error: function(xhr, type) {
        alert('Ajax error!');
      }
    });
  };

  registerPreviewImage()

  refreshTitle()

});

function editCustomerAddress() {
  wx.openAddress({
    success: function(res) {
      // 用户成功拉出地址 
      // alert(JSON.stringify(res));
      // $('#addressContent').html('收货人姓名:' + res.userName)
      if (res.errMsg == 'openAddress:ok') {
        showCustomerAddress(res);
        editContent(JSON.stringify(res), 'orderByCustomer', 'customerExpressInfo')
      }
    },
    cancel: function() {
      // 用户取消拉出地址
      console.log('cancel')
    }
  });
}

function showCustomerAddress(res) {
  // $('#customerAddressContent').html('姓名:' + res.userName + '<br>' + '邮编:' + res.postalCode + '<br>' + res.provinceName + ' ' + res.cityName + ' ' + res.countryName + ' ' + res.detailInfo + '<br>电话:' + res.telNumber + '')
  tailorExpressInfo.customerAddressInfo = '姓名:' + res.userName + '<br>' + '邮编:' + res.postalCode + '<br>' + res.provinceName + ' ' + res.cityName + ' ' + res.countryName + ' ' + res.detailInfo + '<br>电话:' + res.telNumber
}

function showTailorAddress(res) {
  // $('#tailorAddressContent').html('请支付后将需要绣制衣物快递(请勿使用到付)到以下地址：<br>姓名:' + res.userName + '<br>' + '邮编:' + res.postalCode + '<br>' + res.provinceName + ' ' + res.cityName + ' ' + res.countryName + ' ' + res.detailInfo + '<br>电话:' + res.telNumber + '')
  tailorExpressInfo.tailorAddressInfo = '请支付后将需要绣制衣物快递(请勿使用到付)到以下地址：<br>姓名:' + res.userName + '<br>' + '邮编:' + res.postalCode + '<br>' + res.provinceName + ' ' + res.cityName + ' ' + res.countryName + ' ' + res.detailInfo + '<br>电话:' + res.telNumber
}

function editContent(val, table, item) {
  modifyTag = new Date().getTime()
  var editInfo = {
    value: val,
    id: getUrlParam('id'),
    modifyTag: modifyTag,
    table: table,
    item: item,
  };
  // document.title = $('#textareaNote').val()
  console.log(editInfo);
  $('#modifyStatus').html('保存中...')
  $.ajax({
    url: "../ajax/editValueAjax",
    type: "post",
    contentType: "application/json",
    data: JSON.stringify(editInfo),
    dateType: "json",
    success: function(result) {
      var rev = JSON.parse(result);
      if (rev.status == 'ok') {
        if (rev.modifyTag == modifyTag) {
          $('#modifyStatus').html('已保存')
            // refreshTitle()
        }
      } else {
        console.log(rev)
      }
    },
  });
};


var orderInfo = null;
var tailorExpressInfo = new Vue({
  el: '#tailorExpressInfo',
  data: {
    tailorAddressInfo: '',
    customerAddressInfo: '',
    seen: true,
  },
})

var radioChooseExpressMethod = new Vue({
  el: '#radio-choose-express-method',
  data: {
    pickMethod: '',
    canUpdate: false,
  },
  watch: {
    pickMethod: function(val, oldVal) {
      console.log(orderInfo)
      if (val == 'byHand') {
        tailorExpressInfo.seen = false
      } else {
        tailorExpressInfo.seen = true
        showExpressDiv()
      }
      if (orderInfo && orderInfo[0].expressMethod != val) {
        this.canUpdate = true;
      }
      if (this.canUpdate) {
        editContent(val, 'orderByCustomer', 'expressMethod')
      }
    }
  }
})



function getOrderInfo() {
  $.ajax({
    type: 'GET',
    url: "../ajax/getOrderInfoAjax?orderId=" + getUrlParam('id'),
    dataType: 'json',
    success: function(data) {
      orderInfo = data
      console.log(data)
      if (data.length > 0) {
        radioChooseExpressMethod.pickMethod = orderInfo[0].expressMethod
        if (radioChooseExpressMethod.pickMethod == 'byHand') {
          tailorExpressInfo.seen = false
        }
        showExpressDiv()
          // refreshShareTitle()
      } else {
        console.log('none')
      }
      $('#loadingToast').css("display", "none")
        // $('.weui-cells').append(result);
    },
    error: function(xhr, type) {
      console.log(xhr)
      console.log(type)
        // alert('Ajax error!');
    }
  });
}

function showExpressDiv() {
  if (orderInfo[0].customerExpressInfo && orderInfo[0].customerExpressInfo.length > 0) {
    var res = JSON.parse(orderInfo[0].customerExpressInfo);
    showCustomerAddress(res);
  }
  if (orderInfo[0].tailorExpressInfo && orderInfo[0].tailorExpressInfo.length > 0) {
    var res = JSON.parse(orderInfo[0].tailorExpressInfo);
    showTailorAddress(res);
  }
}

function refreshTitle() {
  function shareData(act) {
    // title: '微信JS-SDK Demo',
    // desc: '读书接龙',
    // link: 'http://demo.open.weixin.qq.com/jssdk/',
    // imgUrl: 'http://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRt8Qia4lv7k3M9J1SKqKCImxJCt7j9rHYicKDI45jRPBxdzdyREWnk0ia0N5TMnMfth7SdxtzMvVgXg/0'
    return {
      title: $('#textareaNote').val(), // 分享标题
      desc: '请关注公众号-读书接龙', // 分享描述
      // link: '', // 分享链接，该链接域名或路径必须与当前页面对应的公众号JS安全域名一致
      imgUrl: imgUrl, // 分享图标
      success: function() {
        logAction(act, 'success');
        // 用户确认分享后执行的回调函数
      },
      cancel: function() {
        logAction(act, 'cancel');
        // 用户取消分享后执行的回调函数
      }
    }
  };
  // wx.onMenuShareAppMessage(shareData);
  wx.onMenuShareTimeline(shareData('onMenuShareTimeline'));
  wx.onMenuShareAppMessage(shareData('onMenuShareAppMessage'));
  wx.onMenuShareQQ(shareData('onMenuShareQQ'));
  wx.onMenuShareWeibo(shareData('onMenuShareWeibo'));
  wx.onMenuShareQZone(shareData('onMenuShareQZone'));
}

function confirmClick() {
  modifyTag = new Date().getTime()
  var noteInfo = {
    note: $('#textareaNote').val(),
    id: getUrlParam('id'),
    modifyTag: modifyTag,
  };
  console.log(noteInfo);
  $.ajax({
    url: "../ajax/editNoteAjax",
    type: "post",
    contentType: "application/json",
    data: JSON.stringify(noteInfo),
    async: false,
    dateType: "json",
    success: function(result) {
      var rev = JSON.parse(result);
      if (rev.status == 'ok') {
        location = 'read?id=' + $('#readId').val()
      } else {
        console.log(rev)
      }
    },
  });
}