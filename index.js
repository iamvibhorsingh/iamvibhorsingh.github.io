function showabout() {
    $("#about_container").addClass("active");
}
function closeabout() {
    $("#about_container").removeClass("active");
}

function showwork() {
    $("#work_container").addClass("active");
}
function closework() {
    $("#work_container").removeClass("active");
}

function showcontact() {
    $("#contact_container").addClass("active");
}
function closecontact() {
    $("#contact_container").removeClass("active");
}

// Loading Animation
setTimeout(function () {
    $("#loading").addClass("animated fadeOut");
    setTimeout(function () {
        $("#loading").removeClass("animated fadeOut");
        $("#loading").css("display", "none");
    }, 800);
}, 1500);

// Click outside to close modals
$(document).ready(function () {
    $(document).on("click", function (e) {
        // Check if the click is outside any active container
        if (!$(e.target).closest('.container').length &&
            !$(e.target).closest('#about, #work, #contact').length) {

            // Close any open modals
            if ($("#about_container").hasClass("active")) {
                closeabout();
            }
            if ($("#work_container").hasClass("active")) {
                closework();
            }
            if ($("#contact_container").hasClass("active")) {
                closecontact();
            }
        }
    });
});
