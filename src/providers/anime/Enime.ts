import * as colors from "colors";
import { config } from "../../config";
import Anime, { SearchResponse } from "./Anime";

export default class Enime extends Anime {
    private api = 'https://api.enime.moe';

    constructor() {
        super("https://enime.moe", "Enime");
    }

    public async search(query:string): Promise<Array<SearchResponse>> {
        const page = 0;
        const perPage = 18;

        const req = await this.fetch(`${this.api}/search/${encodeURIComponent(query)}?page=${page}&perPage=${perPage}`);
        const data = req.json();

        if (!data.data) {
            if (config.crawling.debug) {
                console.log(colors.cyan("[Enime]") + colors.red("Unable to parse data for " + query + "."));
            }
            return [];
        }
        return data.data.map((item:any) => ({
            id: item.id,
            title: item.title.english ?? item.title.romaji ?? item.title.native,
            romaji: item.title.romaji,
            native: item.title.native,
            img: item.coverImage,
            year: String(item.year),
            format: item.format,
        }));
    }
}