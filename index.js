const fs = require('fs');
const path = require('path');
const request = require('request');
const express = require('express');
const app = express();
const {
    decode
} = require('urlencode');

const urlList = [`https://blogweb.cn`, `https://blogweb.cn/api`]

const mkdirs = (pathname) => {
    // 需要判断是否是绝对路径（避免不必要的 bug）
    pathname = path.isAbsolute(pathname) ? pathname : path.join(__dirname, pathname);

    // 获取相对路径
    pathname = path.relative(__dirname, pathname);

    // path.sep 避免平台差异带来的 bug
    const floders = pathname.split(path.sep);

    let pre = ''; // 最终用来拼合的路径
    floders.forEach(floder => {
        try {
            const _stat = fs.statSync(path.join(__dirname, pre, floder));
            const hasMkdir = _stat && _stat.isDirectory();
        } catch (err) {
            try {
                fs.mkdirSync(path.join(__dirname, pre, floder));
            } catch (error) {}
        }
        pre = path.join(pre, floder); // 路径拼合
    });
}


app.use(express.static('public'))
const blackList = ['/robots.txt', '\\robots.txt']; //这些文件不回源


function getfileByUrl(url, next, res) {

    let fail_count = 0;
    urlList.forEach(item => {
        //先判断有没有指定的文件在下载
        request.head(`${item}${url}`, (err, response, body) => {
            if (response.statusCode != 200 || err) {
                //文件刷新时候，如果两次请求都失败就删除
                fail_count++;
                if (fail_count == 2) {
                    try {
                        fs.unlinkSync(`public/${url}`)
                        console.log(`删除文件:${url}`);
                    } catch (error) {}
                    if (res) {
                        res.status(response.statusCode);
                        res.end()
                    }
                }
                return false;
            }
            // 判断是否保存
            // 如果有就判断一下文件大小，如果没有就直接保存
            if (fs.existsSync(`public/${url}`) && response.headers['content-length']) {
                let state = fs.statSync(`public/${url}`)
                if (state.size == response.headers['content-length']) {
                    return false;
                }
            }
            mkdirs(`public/${url.split('/').slice(0, url.split('/').length - 1).join('/')}`)
            let stream = fs.createWriteStream(`public/${url}`);
            request(`${item}${url}`).pipe(stream).on("close", async function () {
                console.log(`保存文件:${url}`);
                // 如果是CDN回源就在保存后继续下一个路由
                if (res) {
                    next()
                }
            });
        })
    })
};

app.get('*', (req, res, next) => {
    const target = decode(req.originalUrl) || decode(req.url);
    getfileByUrl(target, next, res)
});
app.use(express.static('public'))


// 获取文件列表，初始化fileList
function fileList(filePath) {
    let fileList = [];

    function fileDisplay(filePath) {
        let files = fs.readdirSync(filePath);
        files.forEach((filename) => {
            let filedir = path.join(filePath, filename); //拼接路径用于app.use
            let stats = fs.statSync(filedir);
            let isFile = stats.isFile();
            let isDir = stats.isDirectory();
            if (isFile && !blackList.includes(filedir.replace('public', ''))) {
                fileList.push(filedir.replace('public', ''));
            }
            if (isDir) {
                fileDisplay(filedir);
            }
        });
    };
    fileDisplay(filePath);
    return fileList;
}


// 一小时请求一次(主要是对文件进行去重)
setInterval(() => {
    const list = fileList('public');
    const targetList = new Array(20).fill(null).map(item => list[Math.floor(Math.random() * list.length)]);
    [...new Set(targetList)].forEach(item => {
        getfileByUrl(item);
    })
}, 3600000);
app.listen(2048, () => {
    console.log('2048');
});