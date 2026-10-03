
//====================================
	//New Balady Code Design System JS
//====================================
$(document).on('click', '.search-link', function () {
	setTimeout(function () {
		$('.modal-backdrop').removeClass('modal-backdrop');
	}, 1);

});
$(function () {

	$('button.print-page').click(function () {
		window.print();
		return false;
	});


	size = parseInt($('body').css('font-size'));


	$(".font-size-content .big").on("click", function () {

		size = size + 2;
		$("body").css("font-size", size + "px");
	});
	$(".font-size-content .normal").on("click", function () {
		size = 16;
		$("body").css("font-size", size + "px");
	});
	$(".font-size-content .small").on("click", function () {
		size = size - 2;
		$("body").css("font-size", size + "px");
	});
	$(document).ready(function () {
		$('#toggle-0').click(function () {
			if ($(this).is(':checked')) {
				$("body").addClass("invert-active")
			} else {
				$("body").removeClass("invert-active")
			}
		});
		$('#toggle-1').click(function () {
			if ($(this).is(':checked')) {
				$("body").addClass("invert-active");
				$("body").removeClass("darkMode-active");
			} else {
				$("body").removeClass("invert-active");
			}
		});
		$('#darkMode').click(function () {
			if ($(this).is(':checked')) {
				$("body").addClass("darkMode-active");
				$("body").removeClass("invert-active");
			} else {
				$("body").removeClass("darkMode-active");
			}
		});

	});

	const arabicDate = getArabicDate();
	document.getElementById('topheader-rightspan').textContent = arabicDate;
	//if (document.getElementById('topheader-rightspan').textContent == 'ar')
	//{
	//	const englishDate = getEnglishDate();
	//	document.getElementById('topheader-rightspan').textContent = englishDate;
	//}else {
	//	const arabicDate = getArabicDate();
	//	document.getElementById('topheader-rightspan').textContent = arabicDate;
	//}
});

$("#webAccessabilityBtnAncor li.custom-toggle").click(function(){
	setTimeout(function(){
	  $("#webAccessabilityBtnAncorBtn").dropdown('toggle')
	},1)
})
$(function () {
	const $buttons = $('.page-options-btns').find('button.btn-step, a.btn, .btn-form-next, .btn-form-draft, .btn-back, .rate-btn, .btn-form-prev');
  
	if ($buttons.length) {
	  const $cards = $('.page-container .section .card.p-lg-4');
  
	  $cards.each(function () {
		const $wrapper = $('<div class="card card-body"></div>');
		const $actions = $('<div class="page-actions-btns wizard-btns"></div>');
  
		// Clone the buttons to keep the original references
		$buttons.clone(true).appendTo($actions);
		$wrapper.append($actions);
		$(this).append($wrapper);
	  });
  
	  // Remove the original buttons
	  $buttons.remove();
	}
});
$(function () {
	const parsleyForm = $('.parsley-style-1').parsley();
  
	$('.parsley-style-1').on('input change', 'input, select, textarea', function () {
	  $(this).parsley().validate();
	});
  });
$(function () {
	"use strict";
	$(".muneer-trigger-btn").click(function () {
		$("#muneer-trigger-button").click();
		return false;
	});
	$(".bookmark-page").click(function () {
		alert(" يمكنك إضافة هذه الصفحة إلى الإشارات المرجعية الخاصة بك عن طريق الضغط علىCTRL + Dلوضع إشارة مرجعية على هذه الصفحة.");
	});
	//====================================
	//choose-service-type collapse
	//====================================
	$('.choose-service-type.top-level .custom-control-label').on('click', function () {
		let labels_selectors= $($(this).parent()?.parent()?.siblings())?.children()?.children('label[data-target]');
		labels_selectors?.removeClass('active')
		$(this).addClass('active');
		var target = $(this).attr('data-target');
		labels_selectors?.each(function(index , element) {
          let id = $(element).attr('data-target');
		  $(id)?.removeClass('show');
		});
		$(target).addClass('show');

	});

	$('.choose-service-type.second-level .custom-control-label').on('click', function () {
		$('.choose-service-type.second-level .custom-control-label').removeClass('active');
		$(this).addClass('active');
		var target = $(this).attr('data-target');
		$('.accordion.second-level  > .collapse').removeClass('show');
		$(target).addClass('show');
	});

	// ==============================================================
	// Media list collapse
	// ==============================================================
	$('.media-list .collapse').on('show.bs.collapse', function () {
		$(this).closest('.media-item').addClass('active');
	})

	$('.media-list .collapse').on('hidden.bs.collapse', function () {
		$(this).closest('.media-item').removeClass('active');
	})


	// ==============================================================
	// Fixed header
	// ==============================================================

	fixed_header();
	$(window).scroll(function () {
		fixed_header();
	});


	function fixed_header() {
		var ht = $('.site-header').height();
		var st = $(window).scrollTop();
		var sf = ht + 200;
		var sb = 800;
		if (st > ht) {
			$('.site-header').addClass('nav-fixed');
			$('.top-navbar').addClass('nav-fixed');
			$('.page-top-fixed').addClass('nav-fixed');
		} else {
			$('.site-header').removeClass('nav-fixed');
			$('.top-navbar').removeClass('nav-fixed');
			$('.page-top-fixed').removeClass('nav-fixed');
		}
		if (st > sf) {
			$('.site-header').addClass('fixed');
			$('.top-navbar').addClass('fixed');
			// $('.page-top-fixed').addClass('fixed');

		} else {
			$('.site-header').removeClass('fixed');
			$('.top-navbar').removeClass('fixed');
			// $('.page-top-fixed').removeClass('fixed');
		}

	}

	fixed_header();
	$(window).scroll(function () {
		fixed_header();
	});


	function fixed_header() {
		var headerHeight = $('.site-header-cont .navbar').height();
		var siteWindow = $(window).scrollTop();
		var sf = headerHeight + 200;
		var scrolled = 800;
		if (siteWindow > headerHeight + 10) {
			$('.site-header-cont').addClass('sticky');
			$('.ipad-menu').addClass('sticky');
			$('.page-top-fixed').addClass('nav-fixed');
			$('.bg-grey').addClass('sticky');
		} else {
			$('.site-header-cont').removeClass('sticky');
			$('.ipad-menu').removeClass('sticky');
			$('.page-top-fixed').removeClass('nav-fixed');
			$('.bg-grey').removeClass('sticky');
		}

	}

	
	//====================================
	//    add next prev in stepanchor
	//====================================
	setInterval(function () {
		$('.page-top-fixed .step-anchor').find('.nav-item.active').prevAll().addClass('nav-item-done');
		$('.page-top-fixed .step-anchor').find('.nav-item.active').nextAll().removeClass('nav-item-done');
	}, 100);
	 
});
function getArabicDate() {
	// Get the current date
	const today = new Date();

	// Extract day, month, and year
	const day = today.getDate();
	const month = today.toLocaleString('ar-EG', { month: 'long' }); // Arabic month name
	const year = today.getFullYear().toString().replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[digit]); // Convert year to Arabic digits

	// Combine the parts
	return `${day.toString().replace(/\d/g, (digit) => '٠١٢٣٤٥٦٧٨٩'[digit])}-${month}-${year}`;
}

function getEnglishDate() {
	// Get the current date
	const today = new Date();

	// Extract day, month, and year
	const day = today.getDate(); // Day of the month (e.g., 11)
	const month = today.toLocaleString('en-US', { month: 'long' }); // Full month name (e.g., March)
	const year = today.getFullYear(); // Year (e.g., 2025)

	// Combine the parts
	return `${day}-${month}-${year}`;
}