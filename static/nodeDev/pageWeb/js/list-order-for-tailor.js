getListRead();

function getListRead() {
	$.ajax({
		type: 'GET',
		url: "../ajax/listOrderByCustomerAjax",
		dataType: 'json',
		success: function(data) {
			console.log(data)
			var result = ''
			data.rows.forEach(function(row) {
				result += '<a href="editOrderByCustomer?id=' + row.id + '"><div class="weui-cell"><div class = "weui-cell__hd" style = "position: relative;margin-right: 10px;" ><img src = "' + row.originPic + '?imageView2/2/w/50"  style = "width: 50px;display: block" /></div><div class = "weui-cell__bd"><p style = "color: #000000;">' + row.textContent + '</p></div></div></a>'
			})
			$('#listRead').html(result);
			getTailorInfoByUnionId(getUrlParam('tailorunionid'))
				// $('.weui-cells').append(result);

		},
		error: function(xhr, type) {
			console.log(xhr)
			console.log(type)
				// alert('Ajax error!');
		}
	});
}

var tailorUnionInfo

function getTailorInfoByUnionId(unionId) {
	if (unionId == null || unionId.length <= 0) {
		unionId = 'ort8d0sF-bwN95UQ2qkxcVLlWp3E'
	}
	tailorUnionId = unionId
	$.ajax({
		type: 'GET',
		url: "../ajax/getTailorInfoByUnionIdAjax?tailorUnionId=" + unionId,
		dataType: 'json',
		success: function(data) {
			console.log(data)
			tailorUnionInfo = data[0]
			if (data[0].tailorNickName != null && data[0].tailorNickName.length > 0) {
				$('#tailorInfo').html("新订单将由 " + data[0].tailorNickName + " 为您服务<br>价格：" + tailorUnionInfo.price);
			} else {
				$('#tailorInfo').html("新订单将由 " + data[0].nickName + " 将为您服务<br>价格：" + tailorUnionInfo.price);
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