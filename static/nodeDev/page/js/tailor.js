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
wx.ready(function() {

	wxSdkSuccess();

	getInfo();
	// 5 图片接口
	// 5.1 拍照、本地选图
	var images = {
		localId: [],
		serverId: []
	};
	document.querySelector('#chooseImage').onclick = function() {
		wx.chooseImage({
			count: 1, // 默认9
			sizeType: ['compressed'], // 可以指定是原图还是压缩图，默认二者都有
			sourceType: ['album', 'camera'], // 可以指定来源是相册还是相机，默认二者都有
			success: function(res) {
				$('#loadingToast').css("display", "block")
				images.localId = res.localIds;
				var i = 0,
					length = images.localId.length;
				images.serverId = [];

				function upload() {
					wx.uploadImage({
						localId: images.localId[i],
						success: function(res) {
							i++;
							//alert('已上传：' + i + '/' + length);
							images.serverId.push(res.serverId);
							if (i < length) {
								upload();
							} else {
								$('#loadingToast').css("display", "block")
								$.ajax({
									url: "../ajax/picUploadAjax?act=tailorMachinePic",
									type: "post",
									contentType: "application/json",
									async: false,
									data: JSON.stringify(images),
									success: function(result) {
										var rev = JSON.parse(result);
										if (rev.status == 'ok') {
											// location = rev.location
											// tailInfo[0].machinePic = rev.picUrl
											$('#previewImage').html('<img src="' + rev.picUrl + '">')
											$('#loadingToast').css("display", "none")
										} else {
											console.log(result)
											alert(result)
											$('#loadingToast').css("display", "none")
										}
									},
									error: function(xhr, status) {
										alert(JSON.stringify(status));
										alert(JSON.stringify(xhr));
										alert('error,请关闭重新进入');
										$('#loadingToast').css("display", "none")
									},
								});
							}
						},
						fail: function(res) {
							alert(JSON.stringify(res));
							$('#loadingToast').css("display", "none")
						}
					});
				}
				upload();
			}
		});
	};
});

var tailInfo;

function getInfo() {
	$.ajax({
		type: 'GET',
		url: "../ajax/tailorAjax",
		dataType: 'json',
		success: function(data) {
			tailInfo = data
			console.log(data)
			if (data.length > 0) {
				console.log('something')
				$('#tailorState').html('状态：资料完善中')
				if (tailInfo[0].machinePic) {
					$('#chooseImage').html('更新绣花机照片')
					$('#previewImage').html('<img src="' + tailInfo[0].machinePic + '">')
				} else {
					$('#chooseImage').html('拍照或从相册上传绣花机照片')
				}
			} else {
				console.log('none')
				$('#tailorState').html('状态：请填写资料')
			}
			var result = ''

			$('#listRead').html(result);
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