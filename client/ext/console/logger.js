/**
 * Logger
 * The logger outputs given messages into the console output, properly formatted.
 *
 * @copyright 2011, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 * @contributor Sergi Mansilla <sergi AT c9 DOT io>
 */
define(function(require, exports, module) {
var editors = require("ext/editors/editors");

exports.test = {};
var MAX_LINES = 512;
var RE_relwsp = /(?:\s|^|\.\/)([\w\_\$-]+(?:\/[\w\_\$-]+)+(?:\.[\w\_\$]+))?(\:\d+)(\:\d+)*/g;
var RE_URL = /\b((?:(?:https?):(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\(([^\s()<>]+|(\([^\s()<>]+\)))*\))+(?:\(([^\s()<>]+|(\([^\s()<>]+\)))*\)|[^\s`!()[\]{};:'".,<>?«»“”‘’]))/i;
var RE_COLOR = /\u001b\[([\d;]+)?m/g;

// Remove as many elements in the console output area so that between
// the existing buffer and the stream coming in we have the right
// amount of lines according to MAX_LIMIT.
var balanceBuffer = function(elem) {
    var len = elem.childNodes.length;
    if (len <= MAX_LINES)
        return;

    len = len - MAX_LINES;
    for (var i = 0; i < len; i++)
        elem.removeChild(elem.firstChild);
};

var jump = function(path, row, column) {
    row = parseInt(row.slice(1), 10);
    column = column ? parseInt(column.slice(1), 10) : 0;
    editors.showFile(path, row, column);
};

// Maximum amount of buffer history
var bufferInterval = {};
var setBufferInterval = function(el, id) {
    bufferInterval[id] = setInterval(function() {
        balanceBuffer(el);
    }, 1000);
};

var strRepeat = function(s, t) { return new Array(t + 1).join(s); };
var escRegExp = function(s) { return s.replace(/([.*+?^${}()|[\]\/\\])/g, '\\$1'); };

var createItem = module.exports.test.createItem = function(line, ide) {
    if (!line) return "";

    var workspaceDir = ide.workspaceDir;
    var davPrefix = ide.davPrefix;
    var wsRe = new RegExp(escRegExp(workspaceDir) + "\\/([^:]*)(:\\d+)(:\\d+)*", "g");

    if ((line.search(RE_relwsp) !== -1) || (line.search(wsRe) !== -1)) {
        var html = "<a href='#' data-wsp='" + davPrefix + "/$1,$2,$3'>___$1$2$3</a>";
        line = line
            .replace(RE_relwsp, html.replace("___", ""))
            .replace(wsRe, html.replace("___", workspaceDir + "/"));
    }
    else if (line.search(RE_URL) !== -1) {
        line = line.replace(RE_URL, "<a href='$1' target='_blank'>$1</a>");
    }
    
    // escape HTML/ XML, but preserve the links:
    var links = [];
    var replacer = "###$#$#$##0";
    line = line.replace(/(<a.*?a>)/gi, function(m) {
        links.push(m);
        return replacer;
    });
    
    line = apf.escapeXML(line);
    
    line = line.replace(replacer, function() {
        return links.shift();
    });
    
    var open = 0;
    line = line
        .replace(/\s{2,}/g, function(str) { return strRepeat("&nbsp;", str.length); })
        .replace(RE_COLOR, function(m, style) {
            if (!style)
                return "";
            style = parseInt(style.replace(";", ""), 10);
            // check for end of style delimiters
            if (open > 0 && (style === 39 || (style < 30 && style > 20))) {
                --open;
                return "</span>";
            }
            else {
                if (style === 1) {
                    ++open;
                    return "<span class=\"term_boldColor\" style=\"font-weight:bold\">";
                }
                else if (style === 3) {
                    ++open;
                    return "<span style=\"font-style:italic\">";
                }
                else if (style === 4) {
                    ++open;
                    return "<span style=\"text-decoration:underline\">";
                }
                else if (style >= 30 && !(style > 40 && style < 50)) {
                    ++open;
                    var ansiColor = (style % 30);
                    if (ansiColor >= 10)
                        ansiColor -= 2;
                    return "<span class=\"term_ansi" + ansiColor + "Color\">";
                }
                else {
                    return "";
                }
            }
        })
        .replace(/(\u0007|\u001b)\[(K|2J)/g, "");

    if (open > 0)
        return line + (new Array(open + 1).join("</span>"));

    return line;
};

var childBuffer = {};
var childBufferInterval = {};
var eventsAttached;

var getOutputElement = function(choice) {
    var ret = {
        element: txtConsole.$ext,
        id: "console"
    };

    if (!choice)
        return ret;

    // legacy support: choice passed as Boolean TRUE means 'use txtOutput'.
    if (typeof choice == "boolean" && choice) {
        ret.element = txtOutput.$ext;
        ret.id = "output";
    }
    else if (choice.$ext && choice.id) {
        ret.element = choice.$ext;
        ret.id = choice.id;
    }

    return ret;
}

module.exports.logNodeStream = function(data, stream, useOutput, ide) {
    var out = getOutputElement(useOutput);
    var parentEl = out.element;
    var outputId = out.id;

    if (eventsAttached !== true) {
        parentEl.addEventListener("click", function(e) {
            var node = e.target;
            if (node.hasAttribute("data-wsp"))
                jump.apply(null, e.target.getAttribute("data-wsp").split(","));
        });
        eventsAttached = true;
    }

    if (!bufferInterval[outputId])
        setBufferInterval(parentEl, outputId);

    // Interval console output so the browser doesn't crash from high-volume
    // buffers
    if (!childBuffer[outputId]) {
        childBuffer[outputId] = document.createDocumentFragment();
        childBufferInterval[outputId] = setInterval(function() {
            parentEl.appendChild(childBuffer[outputId]);
            childBuffer[outputId] = document.createDocumentFragment();
        }, 100);
    }

    var lines = (data.toString()).split("\n", MAX_LINES);
    var fragment = document.createDocumentFragment();
    for (var i=0, l = lines.length; i<l; i++) {
        var div = document.createElement("div");
        var divContent = createItem(lines[i], ide);
        if (divContent && divContent.length) {
            div.innerHTML = divContent;
            fragment.appendChild(div);
        }
    }

    childBuffer[outputId].appendChild(fragment);
};

var messages = {
    divider: "<span class='cli_divider'></span>",
    prompt: "<span style='color:#86c2f6'>__MSG__</span>",
    command: "<span style='color:#86c2f6'><span>&gt;&gt;&gt;</span><div>__MSG__</div></span>"
};

module.exports.log = function(msg, type, pre, post, useOutput, tracerId) {
    msg = msg.toString().escapeHTML();
    if (!type)
        type = "log";

    if (messages[type])
        msg = messages[type].replace("__MSG__", msg);

    var out = getOutputElement(useOutput);
    var parentEl = out.element;
    var outputId = out.id;

    if (!bufferInterval[outputId])
        setBufferInterval(parentEl, outputId);

    var containerOutput = ['<div'];
    if (tracerId)
        containerOutput.push(' id="', tracerId, '"');
    containerOutput.push(" class='item output_section console_",
            type, "'>", (pre || ""), msg, (post || ""), "</div>");

    parentEl.innerHTML += containerOutput.join("");
};

});
