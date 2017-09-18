getListRead();

function getListRead() {
	$.ajax({
		type: 'GET',
		url: "../ajax/listOrderByTailorAjax",
		dataType: 'json',
		success: function(data) {
			console.log(data)
			var result = ''
			data.rows.forEach(function(row) {
				// result += '<a href="editOrderByCustomer?id=' + row.id + '"><div class="weui-cell"><div class = "weui-cell__hd" style = "position: relative;margin-right: 10px;" ><img src = "' + row.originPic + '?imageView2/2/w/50"  style = "width: 50px;display: block" /></div><div class = "weui-cell__bd"><p style = "color: #000000;">' + row.textContent + '</p></div></div></a>'
				result += '<a href="#"><div class="weui-cell"><div class = "weui-cell__hd" style = "position: relative;margin-right: 10px;" ><img src = "' + data.THUMBNAILS_DOMAIN + row.originPic + '?imageView2/2/w/50"  style = "width: 50px;display: block" /></div><div class = "weui-cell__bd"><p style = "color: #000000;">' + row.textContent + '(' + row.orderState + ')</p></div></div></a>'
			})
			$('#listRead').html(result);
			$('#loadingToast').css("display", "none")
		},
		error: function(xhr, type) {
			console.log(xhr)
			console.log(type)
				// alert('Ajax error!');
		}
	});
}