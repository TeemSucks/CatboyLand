document.addEventListener('DOMContentLoaded', function() {
    document.querySelector('.question2').style.display = 'none';
    document.querySelector('.question3').style.display = 'none';
    document.querySelector('#finish').style.display = 'none';

    document.querySelector('.bad').addEventListener('click', function() {
        this.location.href = '/bot';
    });

    document.querySelector('.b1').addEventListener('click', function() {
        hideAndShow('question1', 'question2');
    });

    document.querySelector('.b2').addEventListener('click', function() {
        hideAndShow('question2', 'question3');
    });

    document.querySelector('.b3').addEventListener('click', function() {
        hideAndShow('question3', 'finish');
        setTimeout(function() {
            this.location.href = '/api/allow';
        }, 1000);
    });

    function hideAndShow(hideClass, showClass) {
        document.querySelector('.' + hideClass).style.display = 'none';
        document.querySelector('.' + showClass).style.display = 'block';
    }
});
document.addEventListener('DOMContentLoaded', function() {
    document.querySelector('.question2').style.display = 'none';
    document.querySelector('.question3').style.display = 'none';
    document.querySelector('.finish').style.display = 'none';

    document.querySelector('.bad').addEventListener('click', function() {
        window.location.href = '/bot';
    });

    document.querySelector('.b1').addEventListener('click', function() {
        hideAndShow('question1', 'question2');
    });

    document.querySelector('.b2').addEventListener('click', function() {
        hideAndShow('question2', 'question3');
    });

    document.querySelector('.b3').addEventListener('click', function() {
        hideAndShow('question3', 'finish');
        setTimeout(function() {
            window.location.href = '/api/allow';
        }, 1000);
    });

    function hideAndShow(hideClass, showClass) {
        document.querySelector('.' + hideClass).style.display = 'none';
        document.querySelector('.' + showClass).style.display = 'block';
    }
});